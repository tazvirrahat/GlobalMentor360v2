"use server";

import { revalidatePath } from "next/cache";
import { askQuestion, postReply, questionSubmissionSchema, replySubmissionSchema } from "@/lib/qa";
import { getCurrentUser } from "@/lib/session";

/**
 * The two Q&A write endpoints the player exposes.
 *
 * Nothing here decides entitlement — lib/qa.ts does, because invariant 1 belongs
 * to the service layer and these actions are only one of the doors to it (the
 * instructor Q&A dashboard will be another). What lives here is the parse and
 * the revalidation.
 */

export type QaState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> }
  | { status: "posted" };

/**
 * The slug comes from the write's own result, never from the form.
 *
 * Revalidating a path is what makes the action's response carry a fresh render
 * of the current route, so the new thread or reply appears without a navigation.
 * A client-supplied path would let a caller invalidate arbitrary routes.
 */
function revalidatePlayer(slug: string) {
  revalidatePath(`/learn/${slug}`);
}

export async function askQuestionAction(_prev: QaState, formData: FormData): Promise<QaState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "You need to sign in first." };

  const parsed = questionSubmissionSchema.safeParse({
    courseId: formData.get("courseId"),
    curriculumItemId: formData.get("curriculumItemId") ?? "",
    scope: formData.get("scope"),
    title: formData.get("title"),
    body: formData.get("body"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the details below.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { scope, curriculumItemId } = parsed.data;

  // A LECTURE thread with no lecture would silently become a course-wide one —
  // asked about this video, filed against the whole course, and unfindable from
  // the page it was asked on. Refuse instead of guessing.
  if (scope === "LECTURE" && curriculumItemId.length === 0) {
    return { status: "error", message: "Couldn't tell which lecture this question is about." };
  }

  const result = await askQuestion({
    userId: user.id,
    courseId: parsed.data.courseId,
    curriculumItemId: scope === "LECTURE" ? curriculumItemId : null,
    title: parsed.data.title,
    body: parsed.data.body,
  });

  if (!result.ok) return { status: "error", message: result.message };

  revalidatePlayer(result.slug);
  return { status: "posted" };
}

export async function replyAction(_prev: QaState, formData: FormData): Promise<QaState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "You need to sign in first." };

  const parsed = replySubmissionSchema.safeParse({
    threadId: formData.get("threadId"),
    body: formData.get("body"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the details below.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  // Nothing in the form says who is answering or in what capacity: postReply
  // reads Course.instructorId itself to set ThreadReply.isInstructor.
  const result = await postReply({
    userId: user.id,
    threadId: parsed.data.threadId,
    body: parsed.data.body,
  });

  if (!result.ok) return { status: "error", message: result.message };

  revalidatePlayer(result.slug);
  return { status: "posted" };
}
