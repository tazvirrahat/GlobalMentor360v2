import { db } from "@/lib/db";

/**
 * The one place course access is decided.
 *
 * INVARIANT 1 (docs/TECH-SPEC.md#invariants): access is read from Enrollment and
 * nothing else. Never query Order, OrderItem, Price, or Refund to answer "can this
 * person watch this?".
 *
 * The reason is not purity. Free courses, admin grants, refunds, and (later) an
 * all-access plan all differ in *how an enrollment comes to exist*, and none of
 * them differ in what access means once it does. Reading orders here would force
 * every one of those paths to grow its own branch in the player's auth check.
 *
 * Adding subscriptions later is a new EnrollmentSource value plus a job that
 * grants and revokes rows. Nothing in this file changes.
 */

/** An enrollment grants access unless it has been revoked. Archiving is a UI state, not a revocation. */
export async function isEnrolled(userId: string, courseId: string): Promise<boolean> {
  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { revokedAt: true },
  });

  return enrollment !== null && enrollment.revokedAt === null;
}

export type PlaybackDecision =
  | { allowed: true; reason: "preview" | "enrolled" }
  | { allowed: false; reason: "not-enrolled" | "not-found" };

/**
 * Whether a user may play a specific curriculum item.
 *
 * Preview items are playable by anyone, including signed-out visitors — that is
 * the conversion path, so `userId` is nullable by design.
 */
export async function canPlayItem(
  userId: string | null,
  curriculumItemId: string,
): Promise<PlaybackDecision> {
  const item = await db.curriculumItem.findUnique({
    where: { id: curriculumItemId },
    select: {
      isPreview: true,
      section: { select: { courseId: true } },
    },
  });

  if (!item) return { allowed: false, reason: "not-found" };
  if (item.isPreview) return { allowed: true, reason: "preview" };
  if (!userId) return { allowed: false, reason: "not-enrolled" };

  const enrolled = await isEnrolled(userId, item.section.courseId);
  return enrolled
    ? { allowed: true, reason: "enrolled" }
    : { allowed: false, reason: "not-enrolled" };
}

/** Whether a user may leave a review. Reviews require a live enrollment (invariant 4). */
export async function canReview(userId: string, courseId: string): Promise<boolean> {
  return isEnrolled(userId, courseId);
}
