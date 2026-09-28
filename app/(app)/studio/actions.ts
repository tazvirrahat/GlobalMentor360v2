"use server";

import { revalidatePath } from "next/cache";
import { toMinorUnits } from "@/lib/money-input";
import { readFaqRows } from "@/lib/course-faq";
import { ensureInstructorSlug } from "@/lib/instructors";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { hasRole, requireRole } from "@/lib/session";
import { submitForReview, withdrawReview } from "@/lib/course-review";
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

  // A first course makes this person an instructor with a public page to come;
  // give them its address now so the course page can link to it once published.
  await ensureInstructorSlug(user.id);

  redirect(`/studio/courses/${course.id}`);
}

/** Two saves racing for the same course and currency; the index rejects the loser. */
function isDuplicateActivePrice(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

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
async function setActivePrice(
  tx: Tx,
  courseId: string,
  currency: string,
  amount: number,
): Promise<void> {
  const current = await tx.price.findFirst({
    where: { courseId, currency, isActive: true },
    select: { id: true, amount: true },
  });

  if (current?.amount === amount) return;

  if (current) {
    await tx.price.update({ where: { id: current.id }, data: { isActive: false } });
  }

  await tx.price.create({ data: { courseId, currency, amount, isActive: true } });
}

async function replaceLinedField(
  tx: Tx,
  courseId: string,
  table: "courseObjective" | "courseRequirement" | "courseTargetAudience",
  values: string[],
): Promise<void> {
  const rows = values
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .slice(0, 20)
    .map((text, position) => ({ courseId, text: text.slice(0, 300), position }));

  if (table === "courseObjective") {
    await tx.courseObjective.deleteMany({ where: { courseId } });
    if (rows.length) await tx.courseObjective.createMany({ data: rows });
    return;
  }
  if (table === "courseRequirement") {
    await tx.courseRequirement.deleteMany({ where: { courseId } });
    if (rows.length) await tx.courseRequirement.createMany({ data: rows });
    return;
  }
  await tx.courseTargetAudience.deleteMany({ where: { courseId } });
  if (rows.length) await tx.courseTargetAudience.createMany({ data: rows });
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

  // FAQ rows are checked before any write, like the price below: a half-filled
  // row refuses the whole save instead of wiping the lists first.
  const faq = readFaqRows(formData.getAll("faqQuestion").map(String), formData.getAll("faqAnswer").map(String));
  if (!faq.ok) return { status: "error", message: faq.message };

  // Category: only when the form carries the field; "none" is the Radix
  // select's stand-in for no category. An id that no longer exists is refused.
  let category: { primaryCategoryId: string | null } | Record<string, never> = {};
  if (formData.has("categoryId")) {
    const value = String(formData.get("categoryId") ?? "");
    if (value && value !== "none") {
      const exists = await db.category.findUnique({ where: { id: value }, select: { id: true } });
      if (!exists) return { status: "error", message: "That category no longer exists. Pick another." };
      category = { primaryCategoryId: value };
    } else {
      category = { primaryCategoryId: null };
    }
  }

  // Price is validated before any write. Lined fields used to be delete-and-
  // recreated first, so a bad amount or a unique-constraint race on price left
  // the lists already wiped (or half-written) while the action returned an error.
  let price: { currency: string; amount: number } | null = null;
  if (input.priceCurrency && input.priceAmount !== undefined && input.priceAmount !== "") {
    const amount = toMinorUnits(input.priceAmount);
    if (amount === null) {
      return {
        status: "error",
        message: "Price must be 0 or more, with at most 2 decimal places.",
      };
    }
    price = { currency: input.priceCurrency.toUpperCase(), amount };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.course.update({
        where: { id: owned.id },
        data: {
          title: input.title,
          subtitle: input.subtitle || null,
          description: input.description || null,
          level: input.level,
          language: input.language,
          ...category,
        },
      });

      await replaceLinedField(
        tx,
        owned.id,
        "courseObjective",
        formData.getAll("objectives").map(String),
      );
      await replaceLinedField(
        tx,
        owned.id,
        "courseRequirement",
        formData.getAll("requirements").map(String),
      );
      await replaceLinedField(
        tx,
        owned.id,
        "courseTargetAudience",
        formData.getAll("audience").map(String),
      );

      // Only a form that carries the FAQ editor rewrites the FAQ, so a caller
      // that posts the other fields alone cannot wipe it by omission.
      if (formData.has("faqEditor")) await tx.courseFaq.deleteMany({ where: { courseId: owned.id } });
      if (formData.has("faqEditor") && faq.rows.length > 0) {
        await tx.courseFaq.createMany({
          data: faq.rows.map((row, position) => ({ courseId: owned.id, ...row, position })),
        });
      }

      if (price) {
        // The form submits one currency at a time, so this touches that currency
        // and no other. Prices in the other currency are left exactly as they were.
        await setActivePrice(tx, owned.id, price.currency, price.amount);
      }
    });
  } catch (error) {
    if (!isDuplicateActivePrice(error)) throw error;
    return {
      status: "error",
      message: "This course's price was changed elsewhere. Reload and try again.",
    };
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

  // Instructors send a course to review; admins, who do the reviewing, publish directly.
  if (publish && !(await hasRole(user.id, "ADMIN"))) {
    const result = await submitForReview(user.id, owned.id);
    if (!result.ok) return { status: "error", message: result.message };
    revalidatePath(`/studio/courses/${owned.id}`);
    return { status: "done", message: "Sent for review. You'll get a notification when it's approved or returned." };
  }

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

/** Takes a course out of the review queue, back to Draft. */
export async function withdrawFromReview(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const courseId = String(formData.get("courseId") ?? "");
  const result = await withdrawReview(user.id, courseId);
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath(`/studio/courses/${courseId}`);
  return { status: "done", message: "Withdrawn. The course is a draft again." };
}
