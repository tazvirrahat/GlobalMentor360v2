"use server";

import { revalidatePath } from "next/cache";
import { announcementSubmissionSchema, sendAnnouncement } from "@/lib/announcements";
import { requireRole } from "@/lib/session";

export type AnnouncementState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

/**
 * Publishes an announcement to a course's enrolled learners.
 *
 * Ownership is not checked here: `sendAnnouncement` puts the instructor into the
 * `where` of its own course lookup, so this action cannot hand it a course the
 * signed-in user does not teach. ADMIN is accepted by requireRole for the
 * platform-support case, and still has to own the course to send — which is the
 * conservative reading, and the one to revisit deliberately if support ever needs
 * to post on someone else's behalf.
 */
export async function publishAnnouncement(
  _prev: AnnouncementState,
  formData: FormData,
): Promise<AnnouncementState> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");

  const parsed = announcementSubmissionSchema.safeParse({
    courseId: formData.get("courseId"),
    subject: formData.get("subject"),
    body: formData.get("body"),
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const result = await sendAnnouncement({
    instructorId: user.id,
    courseId: parsed.data.courseId,
    subject: parsed.data.subject,
    body: parsed.data.body,
  });

  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/studio/announcements");

  // Reported separately because they are separate outcomes: the announcement is
  // published and readable in the player either way, and pretending the mail run
  // was clean when it was not is how nobody finds out SES is misconfigured.
  const posted = `Sent to ${result.recipients} ${result.recipients === 1 ? "learner" : "learners"}.`;
  const failed =
    result.emailFailures > 0
      ? ` ${result.emailFailures} ${result.emailFailures === 1 ? "email" : "emails"} could not be delivered — the announcement is still posted in the course.`
      : "";

  return { status: "done", message: posted + failed };
}
