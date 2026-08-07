"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";

export type CurriculumState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

/** Confirms the course belongs to this instructor before any write. */
async function assertOwned(courseId: string, instructorId: string) {
  const course = await db.course.findFirst({
    where: { id: courseId, instructorId },
    select: { id: true, slug: true },
  });
  return course;
}

/** Resolves a section to its course, so item actions can check ownership too. */
async function ownedSection(sectionId: string, instructorId: string) {
  return db.section.findFirst({
    where: { id: sectionId, course: { instructorId } },
    select: { id: true, courseId: true, course: { select: { slug: true } } },
  });
}

export async function addSection(_prev: CurriculumState, formData: FormData): Promise<CurriculumState> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const courseId = String(formData.get("courseId") ?? "");
  const title = String(formData.get("title") ?? "").trim();

  if (!title) return { status: "error", message: "Section needs a title." };

  const course = await assertOwned(courseId, user.id);
  if (!course) return { status: "error", message: "Course not found." };

  const last = await db.section.findFirst({
    where: { courseId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  await db.section.create({
    data: { courseId, title, position: (last?.position ?? -1) + 1 },
  });

  revalidatePath(`/studio/courses/${courseId}/curriculum`);
  return { status: "done", message: "Section added." };
}

export async function deleteSection(_prev: CurriculumState, formData: FormData): Promise<CurriculumState> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const sectionId = String(formData.get("sectionId") ?? "");

  const section = await ownedSection(sectionId, user.id);
  if (!section) return { status: "error", message: "Section not found." };

  await db.$transaction(async (tx) => {
    await tx.section.delete({ where: { id: sectionId } });
    // Close the gap so positions stay contiguous; @@unique([courseId, position])
    // makes sparse positions a trap for the next insert.
    const remaining = await tx.section.findMany({
      where: { courseId: section.courseId },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    await resequence(tx, "section", remaining);
  });

  revalidatePath(`/studio/courses/${section.courseId}/curriculum`);
  return { status: "done", message: "Section deleted." };
}

export async function addItem(_prev: CurriculumState, formData: FormData): Promise<CurriculumState> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const sectionId = String(formData.get("sectionId") ?? "");
  const title = String(formData.get("title") ?? "").trim();

  if (!title) return { status: "error", message: "Lecture needs a title." };

  const section = await ownedSection(sectionId, user.id);
  if (!section) return { status: "error", message: "Section not found." };

  const last = await db.curriculumItem.findFirst({
    where: { sectionId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  await db.curriculumItem.create({
    data: {
      sectionId,
      type: "LECTURE",
      title,
      position: (last?.position ?? -1) + 1,
      lecture: {
        // Article by default. Video arrives once the upload pipeline exists;
        // creating a VIDEO lecture with no asset would be a broken row.
        create: { contentType: "ARTICLE", durationSeconds: 0 },
      },
    },
  });

  revalidatePath(`/studio/courses/${section.courseId}/curriculum`);
  return { status: "done", message: "Lecture added." };
}

export async function deleteItem(_prev: CurriculumState, formData: FormData): Promise<CurriculumState> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const itemId = String(formData.get("itemId") ?? "");

  const item = await db.curriculumItem.findFirst({
    where: { id: itemId, section: { course: { instructorId: user.id } } },
    select: { id: true, sectionId: true, section: { select: { courseId: true } } },
  });
  if (!item) return { status: "error", message: "Lecture not found." };

  await db.$transaction(async (tx) => {
    await tx.curriculumItem.delete({ where: { id: itemId } });
    const remaining = await tx.curriculumItem.findMany({
      where: { sectionId: item.sectionId },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    await resequence(tx, "item", remaining);
  });

  revalidatePath(`/studio/courses/${item.section.courseId}/curriculum`);
  return { status: "done", message: "Lecture deleted." };
}

export async function togglePreview(_prev: CurriculumState, formData: FormData): Promise<CurriculumState> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const itemId = String(formData.get("itemId") ?? "");

  const item = await db.curriculumItem.findFirst({
    where: { id: itemId, section: { course: { instructorId: user.id } } },
    select: { id: true, isPreview: true, section: { select: { courseId: true } } },
  });
  if (!item) return { status: "error", message: "Lecture not found." };

  await db.curriculumItem.update({
    where: { id: itemId },
    data: { isPreview: !item.isPreview },
  });

  revalidatePath(`/studio/courses/${item.section.courseId}/curriculum`);
  return { status: "done", message: item.isPreview ? "Preview off." : "Preview on." };
}

export async function moveItem(_prev: CurriculumState, formData: FormData): Promise<CurriculumState> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const itemId = String(formData.get("itemId") ?? "");
  const direction = String(formData.get("direction") ?? "");

  const item = await db.curriculumItem.findFirst({
    where: { id: itemId, section: { course: { instructorId: user.id } } },
    select: { id: true, position: true, sectionId: true, section: { select: { courseId: true } } },
  });
  if (!item) return { status: "error", message: "Lecture not found." };

  const delta = direction === "up" ? -1 : 1;
  const neighbour = await db.curriculumItem.findFirst({
    where: { sectionId: item.sectionId, position: item.position + delta },
    select: { id: true, position: true },
  });
  if (!neighbour) return { status: "done", message: "Already at the end." };

  // @@unique([sectionId, position]) means a direct swap collides mid-transaction.
  // Park one row at a position that cannot exist, then swap.
  await db.$transaction(async (tx) => {
    await tx.curriculumItem.update({ where: { id: item.id }, data: { position: -1 } });
    await tx.curriculumItem.update({
      where: { id: neighbour.id },
      data: { position: item.position },
    });
    await tx.curriculumItem.update({
      where: { id: item.id },
      data: { position: neighbour.position },
    });
  });

  revalidatePath(`/studio/courses/${item.section.courseId}/curriculum`);
  return { status: "done", message: "Moved." };
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/**
 * Rewrites positions to 0..n-1.
 *
 * Two passes with negative parking positions, because @@unique on
 * (sectionId, position) rejects the intermediate states of a single pass — row 2
 * cannot take position 1 while row 1 still holds it.
 *
 * The two models are handled in separate branches rather than through one
 * variable: `tx.section` and `tx.curriculumItem` have incompatible generic
 * signatures, so unioning them produces a value TypeScript refuses to call.
 */
async function resequence(tx: Tx, kind: "section" | "item", rows: { id: string }[]) {
  if (kind === "section") {
    for (const [index, row] of rows.entries()) {
      await tx.section.update({ where: { id: row.id }, data: { position: -(index + 1) } });
    }
    for (const [index, row] of rows.entries()) {
      await tx.section.update({ where: { id: row.id }, data: { position: index } });
    }
    return;
  }

  for (const [index, row] of rows.entries()) {
    await tx.curriculumItem.update({ where: { id: row.id }, data: { position: -(index + 1) } });
  }
  for (const [index, row] of rows.entries()) {
    await tx.curriculumItem.update({ where: { id: row.id }, data: { position: index } });
  }
}
