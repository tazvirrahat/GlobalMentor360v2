"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { getOwnedCourse, readinessChecks, slugify, uniqueSlug } from "@/lib/studio";

export type ActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

const createSchema = z.object({
  title: z.string().trim().min(4, "Give the course a title of at least 4 characters.").max(120),
  // `subtitle` and `categoryId` are optional to the author and are read as
  // `?? ""`. z.string() already accepts "", so no extra branch lets them through.
  subtitle: z.string().trim().max(200),
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "ALL_LEVELS"]),
  language: z.string().trim().min(2).max(10),
  categoryId: z.string(),
});

export async function createCourse(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");

  const parsed = createSchema.safeParse({
    title: formData.get("title"),
    subtitle: formData.get("subtitle") ?? "",
    level: formData.get("level"),
    language: formData.get("language"),
    categoryId: formData.get("categoryId") ?? "",
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const input = parsed.data;
  const slug = await uniqueSlug(slugify(input.title));

  const course = await db.course.create({
    data: {
      title: input.title,
      slug,
      subtitle: input.subtitle || null,
      level: input.level,
      language: input.language,
      // New courses are never live. Publishing is a separate, checked action.
      status: "DRAFT",
      instructorId: user.id,
      // "none" is the Radix select's stand-in for "no category" — it cannot submit "".
      primaryCategoryId: input.categoryId && input.categoryId !== "none" ? input.categoryId : null,
    },
    select: { id: true },
  });

  redirect(`/studio/courses/${course.id}`);
}

/** `amount` is a Postgres INTEGER — past this a "price" is a typo, not money. */
const MAX_MINOR_UNITS = 2_147_483_647;

/**
 * Parses a decimal amount into integer minor units without a float in the path.
 *
 * `Math.round(Number(input) * 100)` lands on the right integer for the amounts a
 * form produces, but it gets there through binary floating point — 49.99 * 100
 * is 4998.999999999999. Splitting on the decimal point keeps money integral all
 * the way down, which is the rule everywhere else in commerce.
 *
 * Null for anything that is not a plain non-negative decimal with at most two
 * fraction digits — including the third digit that rounding used to swallow.
 */
function toMinorUnits(input: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!match) return null;

  const minor = Number(match[1] ?? "0") * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return minor <= MAX_MINOR_UNITS ? minor : null;
}

/**
 * Sets the active price for ONE currency, leaving every other currency alone.
 *
 * The scoping is the point. Stripe settles in USD and bKash settles in BDT, so a
 * course sold on both rails must hold an active price in each — "save" cannot
 * read as "make this the only price". What this replaced upserted on a compound
 * key that included isActive, which meant switching the currency in the form
 * created a second active row instead of moving the price, and the catalog was
 * then left guessing which of the two to show.
 *
 * A change archives the old row rather than overwriting it, because the partial
 * unique index (migration 20260807000002) constrains only active rows: history
 * is now free, and "exactly one active price per currency" stays true at every
 * instant an outside reader could look.
 */
async function setActivePrice(courseId: string, currency: string, amount: number): Promise<void> {
  await db.$transaction(async (tx) => {
    const current = await tx.price.findFirst({
      where: { courseId, currency, isActive: true },
      select: { id: true, amount: true },
    });

    if (current?.amount === amount) return;

    if (current) {
      await tx.price.update({ where: { id: current.id }, data: { isActive: false } });
    }

    await tx.price.create({ data: { courseId, currency, amount, isActive: true } });
  });
}

/** Two saves racing for the same course and currency; the index rejects the loser. */
function isDuplicateActivePrice(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

const settingsSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().trim().min(4).max(120),
  subtitle: z.string().trim().max(200),
  description: z.string().trim().max(5000),
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "ALL_LEVELS"]),
  language: z.string().trim().min(2).max(10),
  priceAmount: z.string().optional(),
  priceCurrency: z.string().optional(),
});

export async function updateCourse(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");

  const parsed = settingsSchema.safeParse({
    courseId: formData.get("courseId"),
    title: formData.get("title"),
    subtitle: formData.get("subtitle") ?? "",
    description: formData.get("description") ?? "",
    level: formData.get("level"),
    language: formData.get("language"),
    priceAmount: formData.get("priceAmount") ?? "",
    priceCurrency: formData.get("priceCurrency") ?? "",
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const input = parsed.data;

  // Ownership is part of the lookup, not a check afterwards.
  const owned = await getOwnedCourse(input.courseId, user.id);
  if (!owned) return { status: "error", message: "Course not found." };

  await db.course.update({
    where: { id: owned.id },
    data: {
      title: input.title,
      subtitle: input.subtitle || null,
      description: input.description || null,
      level: input.level,
      language: input.language,
    },
  });

  if (input.priceCurrency && input.priceAmount !== undefined && input.priceAmount !== "") {
    // Stored as integer minor units so no float ever touches money.
    const amount = toMinorUnits(input.priceAmount);
    if (amount === null) {
      return {
        status: "error",
        message: "Price must be 0 or more, with at most 2 decimal places.",
      };
    }

    // The form submits one currency at a time, so this touches that currency and
    // no other. Prices in the other currency are left exactly as they were.
    try {
      await setActivePrice(owned.id, input.priceCurrency.toUpperCase(), amount);
    } catch (error) {
      if (!isDuplicateActivePrice(error)) throw error;
      return {
        status: "error",
        message: "This course's price was changed elsewhere. Reload and try again.",
      };
    }
  }

  revalidatePath(`/studio/courses/${owned.id}`);
  revalidatePath(`/courses/${owned.slug}`);
  return { status: "done", message: "Saved." };
}

export async function setPublished(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");

  const courseId = String(formData.get("courseId") ?? "");
  const publish = String(formData.get("publish") ?? "") === "true";

  const owned = await getOwnedCourse(courseId, user.id);
  if (!owned) return { status: "error", message: "Course not found." };

  if (publish) {
    const checks = await readinessChecks(owned.id);
    const failed = checks.filter((check) => !check.ok);
    if (failed.length > 0) {
      return {
        status: "error",
        message: `Not ready to publish: ${failed.map((f) => f.label.toLowerCase()).join(", ")}.`,
      };
    }
  }

  await db.course.update({
    where: { id: owned.id },
    data: {
      status: publish ? "PUBLISHED" : "UNPUBLISHED",
      // Set once, on first publish, so re-publishing doesn't reorder the catalog.
      publishedAt: publish ? (owned.status === "PUBLISHED" ? undefined : new Date()) : undefined,
    },
  });

  revalidatePath("/courses");
  revalidatePath(`/courses/${owned.slug}`);
  revalidatePath(`/studio/courses/${owned.id}`);

  return { status: "done", message: publish ? "Published." : "Unpublished." };
}
