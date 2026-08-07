"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { getOwnedCourse, readinessChecks, slugify, uniqueSlug } from "@/lib/studio";

export type ActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

const createSchema = z.object({
  title: z.string().trim().min(4, "Give the course a title of at least 4 characters.").max(120),
  subtitle: z.string().trim().max(200).optional().or(z.literal("")),
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "ALL_LEVELS"]),
  language: z.string().trim().min(2).max(10),
  categoryId: z.string().optional().or(z.literal("")),
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

const settingsSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().trim().min(4).max(120),
  subtitle: z.string().trim().max(200).optional().or(z.literal("")),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
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
    const major = Number(input.priceAmount);
    if (Number.isNaN(major) || major < 0) {
      return { status: "error", message: "Price must be a number of 0 or more." };
    }

    // Stored as integer minor units so no float ever touches money.
    const amount = Math.round(major * 100);
    const currency = input.priceCurrency.toUpperCase();

    await db.price.upsert({
      where: { courseId_currency_isActive: { courseId: owned.id, currency, isActive: true } },
      update: { amount },
      create: { courseId: owned.id, currency, amount, isActive: true },
    });
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
