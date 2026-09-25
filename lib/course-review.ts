import { db } from "@/lib/db";
import { notify, notifyMany } from "@/lib/notifications";
import { readinessChecks } from "@/lib/studio";

/**
 * Review before publishing (spec §12). An instructor who is not an admin
 * submits a finished course; an admin approves it (it goes live) or returns it
 * with a note. Every transition checks the course's current state, writes an
 * audit row and tells the other side. Admins publish directly elsewhere
 * (lib/admin.ts) — they are the reviewers.
 */

export type ReviewResult = { ok: true } | { ok: false; message: string };

export const REVIEW_NOTE_MAX = 1000;

async function notReadyMessage(courseId: string): Promise<string | null> {
  const failed = (await readinessChecks(courseId)).filter((check) => !check.ok);
  return failed.length > 0 ? `Not ready yet: ${failed.map((check) => check.label.toLowerCase()).join(", ")}.` : null;
}

async function adminIds(): Promise<string[]> {
  const rows = await db.userRole.findMany({ where: { role: "ADMIN" }, select: { userId: true } });
  return rows.map((row) => row.userId);
}

export async function submitForReview(instructorId: string, courseId: string): Promise<ReviewResult> {
  const course = await db.course.findFirst({
    where: { id: courseId, instructorId },
    select: { id: true, title: true, status: true },
  });
  if (!course) return { ok: false, message: "Course not found." };
  if (course.status === "IN_REVIEW") return { ok: false, message: "This course is already waiting for review." };
  if (course.status === "PUBLISHED") return { ok: false, message: "This course is already live." };

  const notReady = await notReadyMessage(course.id);
  if (notReady) return { ok: false, message: notReady };

  // The status in the where makes a double submit (two tabs) a no-op, not two queue entries.
  const { count } = await db.course.updateMany({
    where: { id: course.id, status: { in: ["DRAFT", "UNPUBLISHED"] } },
    data: { status: "IN_REVIEW", reviewRequestedAt: new Date(), reviewNote: null },
  });
  if (count === 0) return { ok: false, message: "This course changed in the meantime. Reload and try again." };

  await db.auditLog.create({
    data: { actorId: instructorId, action: "course.review.submit", targetType: "course", targetId: course.id },
  });
  await notifyMany(await adminIds(), "course_review", {
    title: "A course is waiting for review",
    body: course.title,
    href: "/admin/courses",
  });
  return { ok: true };
}

/** The instructor takes a submitted course back to Draft (to change something first). */
export async function withdrawReview(instructorId: string, courseId: string): Promise<ReviewResult> {
  const { count } = await db.course.updateMany({
    where: { id: courseId, instructorId, status: "IN_REVIEW" },
    data: { status: "DRAFT", reviewRequestedAt: null },
  });
  if (count === 0) return { ok: false, message: "This course isn't waiting for review." };
  await db.auditLog.create({
    data: { actorId: instructorId, action: "course.review.withdraw", targetType: "course", targetId: courseId },
  });
  return { ok: true };
}

export async function approveReview(adminId: string, courseId: string): Promise<ReviewResult> {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { id: true, title: true, slug: true, status: true, publishedAt: true, instructorId: true },
  });
  if (!course) return { ok: false, message: "Course not found." };
  if (course.status !== "IN_REVIEW") return { ok: false, message: "This course isn't waiting for review." };

  // It may have been edited after it was submitted.
  const notReady = await notReadyMessage(course.id);
  if (notReady) return { ok: false, message: notReady };

  const { count } = await db.course.updateMany({
    where: { id: course.id, status: "IN_REVIEW" },
    data: {
      status: "PUBLISHED",
      publishedAt: course.publishedAt ?? new Date(),
      reviewRequestedAt: null,
      reviewNote: null,
    },
  });
  if (count === 0) return { ok: false, message: "This course changed in the meantime. Reload and try again." };

  await db.auditLog.create({
    data: { actorId: adminId, action: "course.review.approve", targetType: "course", targetId: course.id, metadata: { slug: course.slug } },
  });
  await notify(course.instructorId, "course_review", {
    title: "Your course is live",
    body: course.title,
    href: `/courses/${course.slug}`,
  });
  return { ok: true };
}

export async function returnReview(adminId: string, courseId: string, note: string): Promise<ReviewResult> {
  const text = note.trim();
  if (!text) return { ok: false, message: "Say what needs to change, so the instructor can fix it." };
  if (text.length > REVIEW_NOTE_MAX) return { ok: false, message: `Keep the note to ${REVIEW_NOTE_MAX} characters.` };

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { id: true, title: true, status: true, instructorId: true },
  });
  if (!course) return { ok: false, message: "Course not found." };

  const { count } = await db.course.updateMany({
    where: { id: course.id, status: "IN_REVIEW" },
    data: { status: "DRAFT", reviewRequestedAt: null, reviewNote: text },
  });
  if (count === 0) return { ok: false, message: "This course isn't waiting for review." };

  await db.auditLog.create({
    data: { actorId: adminId, action: "course.review.return", targetType: "course", targetId: course.id, metadata: { note: text } },
  });
  await notify(course.instructorId, "course_review", {
    title: "Your course needs changes",
    body: text,
    href: `/studio/courses/${course.id}?tab=publish`,
  });
  return { ok: true };
}

export async function listReviewQueue() {
  const rows = await db.course.findMany({
    where: { status: "IN_REVIEW" },
    orderBy: { reviewRequestedAt: "asc" },
    take: 100,
    select: { id: true, title: true, slug: true, reviewRequestedAt: true, instructor: { select: { name: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    instructorName: row.instructor.name,
    reviewRequestedAt: row.reviewRequestedAt,
  }));
}
