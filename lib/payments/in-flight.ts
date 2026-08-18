import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export const IN_FLIGHT_PAYMENT_STATUSES = ["PENDING", "PENDING_VERIFICATION"] as const;

/**
 * Thrown when a learner already has a PENDING / PENDING_VERIFICATION payment
 * covering any of the courses they are trying to buy — any rail.
 */
export class InFlightPaymentError extends Error {
  constructor(courseCount: number) {
    super(
      courseCount === 1
        ? "You already have a payment awaiting verification for this course."
        : "You already have a payment awaiting verification for one of these courses.",
    );
    this.name = "InFlightPaymentError";
  }
}

/**
 * Serialises checkouts for this user, then refuses if they already have an
 * in-flight payment (bKash or Stripe) for any of the given courses.
 *
 * The advisory lock is the race-proof half: a findFirst outside a transaction
 * (or without a lock) is check-then-act, and two tabs can both insert. Callers
 * must invoke this on the same transaction client as the order/payment create.
 * A user-row FOR UPDATE is the wrong lock — later writes in the same callback
 * (grantEnrollment → notify) use the global db client and would wait on the FK.
 */
export async function assertNoInFlightPayment(
  tx: Tx,
  userId: string,
  courseIds: string[],
): Promise<void> {
  const unique = [...new Set(courseIds.filter(Boolean))];
  if (unique.length === 0) return;

  // Advisory lock, not users.id FOR UPDATE: grantEnrollment (called in the same
  // transaction on zero-total fulfill) writes notifications through the global
  // `db` client, and a FK insert against a FOR UPDATE user row deadlocks.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`in-flight:${userId}`}))`;

  const existing = await tx.payment.findFirst({
    where: {
      userId,
      status: { in: [...IN_FLIGHT_PAYMENT_STATUSES] },
      order: { items: { some: { courseId: { in: unique } } } },
    },
    select: { id: true },
  });

  if (existing) throw new InFlightPaymentError(unique.length);
}
