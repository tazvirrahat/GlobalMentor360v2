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

/**
 * Runs `work` atomically, so the enrollment row and Course.enrollmentCount always
 * commit or roll back together.
 *
 * Atomicity is decided by whether the caller supplied a client, never by
 * inspecting one. An earlier version branched on `"$transaction" in client`,
 * reasoning that Prisma.TransactionClient omits it — but that omission is only in
 * the *type*. At runtime an interactive-transaction client still carries a
 * `$transaction` function, so that check was always true and every caller took the
 * nested-transaction path. It happened to work (Prisma keeps a nested call inside
 * the same transaction) while resting on an implementation detail that could
 * change in a patch release, and it made the unit tests exercise a branch
 * production never reached.
 */
function inTransaction<T>(client: Client | undefined, work: (tx: Client) => Promise<T>): Promise<T> {
  return client ? work(client) : db.$transaction((tx) => work(tx));
}

export async function grantEnrollment(
  userId: string,
  courseId: string,
  source: EnrollmentSource,
  /** Omit to get a fresh transaction; pass your own when already inside one. */
  client?: Client,
) {
  return inTransaction(client, async (tx) => {
    // Course.enrollmentCount counts *transitions into* an active enrollment, not
    // calls to this function: a retried webhook or a double-clicked approval must
    // add nothing, while a re-grant after a refund must count again.
    //
    // Both writes below report that transition themselves, so the decision comes
    // from rows the database serialised rather than from a preceding read. An
    // earlier version read the row first and incremented when it looked absent —
    // under READ COMMITTED two concurrent grants both saw "absent" and both
    // incremented, inflating the counter for a single enrollment. This is the same
    // check-then-act shape the admin approval queue had.

    // Re-granting clears a prior revocation — a learner who is refunded and then
    // buys again must regain access rather than hit a dead unique constraint.
    const revived = await tx.enrollment.updateMany({
      where: { userId, courseId, revokedAt: { not: null } },
      data: { revokedAt: null },
    });

    // skipDuplicates compiles to ON CONFLICT DO NOTHING, so a concurrent grant
    // yields count 0 instead of raising — which matters inside a transaction,
    // where a unique violation would poison every later statement.
    const created = await tx.enrollment.createMany({
      data: [{ userId, courseId, source }],
      skipDuplicates: true,
    });

    if (created.count > 0 || revived.count > 0) {
      await tx.course.update({
        where: { id: courseId },
        data: { enrollmentCount: { increment: 1 } },
      });
    }

    return tx.enrollment.findUniqueOrThrow({
      where: { userId_courseId: { userId, courseId } },
    });
  });
}

/**
 * Revokes access without deleting history. Refunds and chargebacks land here.
 * The row stays so we keep the record that this person was once enrolled.
 */
export async function revokeEnrollment(
  userId: string,
  courseId: string,
  /** Omit to get a fresh transaction; pass your own when already inside one. */
  client?: Client,
) {
  return inTransaction(client, async (tx) => {
    const revoked = await tx.enrollment.updateMany({
      where: { userId, courseId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // Zero rows matched means the enrollment was already revoked (or never
    // existed), which is what keeps a repeated refund from decrementing twice.
    if (revoked.count > 0) {
      await tx.course.update({
        where: { id: courseId },
        data: { enrollmentCount: { decrement: revoked.count } },
      });
    }

    return revoked;
  });
}
