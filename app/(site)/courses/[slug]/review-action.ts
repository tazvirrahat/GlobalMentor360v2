"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { reviewSubmissionSchema, saveReview } from "@/lib/reviews";
import { getCurrentUser } from "@/lib/session";

export type ReviewState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> }
  | { status: "saved" };

/**
 * Posts or edits the signed-in learner's review.
 *
 * Nothing here decides entitlement — `saveReview` does, because invariant 4
 * belongs to the service layer and this action is only one of the doors to it.
 * The course lookup exists to get a slug for revalidation and to refuse an
 * unpublished course, not to authorise anything.
 */
export async function submitReview(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "You need to sign in first." };

  const parsed = reviewSubmissionSchema.safeParse({
    courseId: formData.get("courseId"),
    rating: formData.get("rating"),
    body: formData.get("body") ?? "",
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the details below.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const course = await db.course.findFirst({
    where: { id: parsed.data.courseId, status: "PUBLISHED" },
    select: { id: true, slug: true },
  });
  if (!course) return { status: "error", message: "Course not found." };

  const body = parsed.data.body;
  const result = await saveReview({
    userId: user.id,
    courseId: course.id,
    rating: parsed.data.rating,
    // An empty textarea is "no written review", not a review whose text is "".
    body: body && body.length > 0 ? body : null,
  });

  if (!result.ok) return { status: "error", message: result.message };

  // The write moved Course.ratingAverage, which the catalog grid renders too.
  revalidatePath(`/courses/${course.slug}`);
  revalidatePath("/courses");

  return { status: "saved" };
}
