import type { Prisma } from "@/generated/prisma/client";
import type { EnrollmentSource } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

/**
 * The single path that grants course access.
 *
 * INVARIANT 7 (docs/TECH-SPEC.md#invariants): every payment rail converges here.
 * Stripe confirms via webhook, bKash via admin approval, admin grants directly —
 * all three call this one function rather than each writing their own enrollment
 * row. Two rails writing enrollments independently is how they drift.
 *
 * Idempotent by design. Stripe retries webhooks, and an admin can double-click
 * approve; neither should produce a second enrollment or resurrect a revoked one
 * by accident.
 */

type Client = Prisma.TransactionClient | typeof db;

export async function grantEnrollment(
  userId: string,
  courseId: string,
  source: EnrollmentSource,
  client: Client = db,
) {
  return client.enrollment.upsert({
    where: { userId_courseId: { userId, courseId } },
    // Re-granting clears a prior revocation — a learner who is refunded and then
    // buys again must regain access rather than hit a dead unique constraint.
    update: { revokedAt: null },
    create: { userId, courseId, source },
  });
}

/**
 * Revokes access without deleting history. Refunds and chargebacks land here.
 * The row stays so we keep the record that this person was once enrolled.
 */
export async function revokeEnrollment(
  userId: string,
  courseId: string,
  client: Client = db,
) {
  return client.enrollment.updateMany({
    where: { userId, courseId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
