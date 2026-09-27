"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { deleteReviewResponse, saveReviewResponse } from "@/lib/reviews";
import { requireRole } from "@/lib/session";

export type ReplyState = { status: "idle" } | { status: "error"; message: string } | { status: "done"; message: string };

async function revalidate(reviewId: string) {
  revalidatePath("/studio/reviews");
  const review = await db.review.findUnique({ where: { id: reviewId }, select: { course: { select: { slug: true } } } });
  if (review) revalidatePath(`/courses/${review.course.slug}`);
}

/** Reply to a review, or edit the reply. Only the course's instructor (lib/reviews checks). */
export async function saveReplyAction(_prev: ReplyState, formData: FormData): Promise<ReplyState> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const reviewId = String(formData.get("reviewId") ?? "");
  const result = await saveReviewResponse(user.id, reviewId, String(formData.get("body") ?? ""));
  if (!result.ok) return { status: "error", message: result.message };
  await revalidate(reviewId);
  return { status: "done", message: "Reply saved. It shows under the review on the course page." };
}

export async function deleteReplyAction(_prev: ReplyState, formData: FormData): Promise<ReplyState> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const reviewId = String(formData.get("reviewId") ?? "");
  const result = await deleteReviewResponse(user.id, reviewId);
  if (!result.ok) return { status: "error", message: result.message };
  await revalidate(reviewId);
  return { status: "done", message: "Reply deleted." };
}
