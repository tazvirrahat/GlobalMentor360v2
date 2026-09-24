"use server";

import { revalidatePath } from "next/cache";
import { postReply, replySubmissionSchema } from "@/lib/qa";
import { requireRole } from "@/lib/session";

export type InboxReplyState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

/**
 * Answers a thread from the inbox.
 *
 * Deliberately a thin wrapper over the same `postReply` the player uses. A
 * second writer here would be two code paths setting `isInstructor` — the drift
 * invariant 7 exists to prevent — and the flag is what marks an answer as
 * authoritative, so the two must not be able to disagree. postReply derives it
 * by comparing the replier to Course.instructorId, which is equally true from
 * this route, so there is nothing extra to pass and nothing extra to trust.
 */
export async function replyFromInbox(
  _prev: InboxReplyState,
  formData: FormData,
): Promise<InboxReplyState> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");

  const parsed = replySubmissionSchema.safeParse({
    threadId: formData.get("threadId"),
    body: formData.get("body"),
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid reply." };
  }

  const result = await postReply({
    userId: user.id,
    threadId: parsed.data.threadId,
    body: parsed.data.body,
  });

  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/studio/qa");
  // The learner reads it in the player, so that copy has to be refreshed too.
  revalidatePath(`/learn/${result.slug}`);

  return { status: "done", message: "Replied." };
}
