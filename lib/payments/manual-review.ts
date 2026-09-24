import { commitCouponReservation, CouponFullyRedeemedError, releaseCouponReservation } from "@/lib/coupons";
import { db } from "@/lib/db";
import { grantEnrollment } from "@/lib/enrollment";
import { clampPage, pageCount, skipTake, type Paged } from "@/lib/pagination";
import { sendPaymentReceipt } from "@/lib/receipts";

/**
 * Reported when the status filter on a write below matches zero rows.
 *
 * Two admins working the same queue — or one double-clicking — both read
 * PENDING_VERIFICATION before either writes, so checking the status before the
 * transaction decides nothing. The status therefore lives in the WHERE clause and
 * the database arbitrates, the same way the Stripe rail absorbs a retried webhook
 * delivery (lib/payments/stripe.ts). Telling the loser "done" would be a lie.
 */
const LOST_RACE = "Another admin reviewed this payment first — nothing changed.";

export type ManualPaymentReview = { ok: true; message: string } | { ok: false; message: string };

export const MANUAL_PAYMENT_QUEUE_PAGE_SIZE = 20;

const PENDING_QUEUE_SELECT = {
  id: true,
  amount: true,
  currency: true,
  createdAt: true,
  bkashTransactionId: true,
  bkashPhoneNumber: true,
  bkashPaymentDate: true,
  bkashReference: true,
  user: { select: { name: true, email: true } },
  order: {
    select: { items: { select: { course: { select: { title: true } } } } },
  },
} as const;

/**
 * Oldest pending manual proofs first, plus a total so the admin queue can page
 * without treating the current slice length as the backlog.
 */
export async function listPendingManualPayments(pageInput = 1) {
  const where = { status: "PENDING_VERIFICATION" as const };
  const total = await db.payment.count({ where });
  const page = clampPage(pageInput, total, MANUAL_PAYMENT_QUEUE_PAGE_SIZE);
  const { skip, take } = skipTake(page, MANUAL_PAYMENT_QUEUE_PAGE_SIZE);

  const items = await db.payment.findMany({
    where,
    orderBy: { createdAt: "asc" },
    skip,
    take,
    select: PENDING_QUEUE_SELECT,
  });

  return {
    items,
    total,
    page,
    pageCount: pageCount(total, MANUAL_PAYMENT_QUEUE_PAGE_SIZE),
  } satisfies Paged<(typeof items)[number]>;
}

/**
 * Approving is the manual rail's equivalent of a Stripe webhook firing.
 *
 * The payment update and the enrollment grant happen in one transaction: a
 * payment marked COMPLETED without the learner gaining access is exactly the
 * failure the prior codebase shipped (docs/PRIOR-ART.md).
 */
export async function approveManualPayment(input: {
  paymentId: string;
  adminId: string;
  notes: string;
}): Promise<ManualPaymentReview> {
  const notes = input.notes.trim();

  const payment = await db.payment.findUnique({
    where: { id: input.paymentId },
    select: {
      id: true,
      userId: true,
      status: true,
      order: { select: { id: true, items: { select: { courseId: true } } } },
    },
  });

  if (!payment) return { ok: false, message: "Payment not found." };

  if (payment.status !== "PENDING_VERIFICATION") {
    // Fast path for a stale queue — a courtesy, not the guard. The guard is the
    // status filter in the write below.
    return { ok: false, message: `Already ${payment.status.toLowerCase()}.` };
  }

  let approved: boolean;
  try {
    approved = await db.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: "PENDING_VERIFICATION" },
        data: {
          status: "COMPLETED",
          // The DB constraint rejects COMPLETED without this. Setting it here is
          // not belt-and-braces — it is the only way the write succeeds.
          verifiedById: input.adminId,
          verifiedAt: new Date(),
          verificationNotes: notes || null,
          paidAt: new Date(),
        },
      });

      // A concurrent approval already moved the row out of PENDING_VERIFICATION.
      // Returning before the order, enrollment, and audit writes keeps this
      // transaction empty rather than duplicating the winner's work.
      if (claimed.count === 0) return false;

      await tx.order.update({
        where: { id: payment.order.id },
        data: { status: "PAID", paidAt: new Date() },
      });

      await commitCouponReservation(tx, payment.order.id);

      for (const item of payment.order.items) {
        await grantEnrollment(payment.userId, item.courseId, "PURCHASE", tx);
      }

      await tx.auditLog.create({
        data: {
          actorId: input.adminId,
          action: "payment.approve",
          targetType: "payment",
          targetId: payment.id,
          metadata: { orderId: payment.order.id },
        },
      });

      return true;
    });
  } catch (error) {
    if (error instanceof CouponFullyRedeemedError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  if (!approved) return { ok: false, message: LOST_RACE };

  await sendPaymentReceipt(payment.order.id);

  return { ok: true, message: "Approved and enrolled." };
}

export async function rejectManualPayment(input: {
  paymentId: string;
  adminId: string;
  notes: string;
}): Promise<ManualPaymentReview> {
  const notes = input.notes.trim();

  if (!notes) {
    // Stored on the payment for staff. Receipts and the learner order page do
    // not include verificationNotes, so this copy must not claim they do.
    return { ok: false, message: "Give a reason." };
  }

  const payment = await db.payment.findUnique({
    where: { id: input.paymentId },
    select: { id: true, status: true, orderId: true },
  });

  if (!payment) return { ok: false, message: "Payment not found." };
  if (payment.status !== "PENDING_VERIFICATION") {
    return { ok: false, message: `Already ${payment.status.toLowerCase()}.` };
  }

  const rejected = await db.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: "PENDING_VERIFICATION" },
      data: {
        status: "FAILED",
        verificationNotes: notes,
        verifiedById: input.adminId,
        verifiedAt: new Date(),
      },
    });

    // Same race as approveManualPayment, and the same arbitration. Losing here
    // matters more, not less: the winner may have approved, and overwriting the
    // order would strand a learner who has already been enrolled.
    if (claimed.count === 0) return false;

    await tx.order.update({ where: { id: payment.orderId }, data: { status: "FAILED" } });
    await releaseCouponReservation(tx, payment.orderId);
    await tx.auditLog.create({
      data: {
        actorId: input.adminId,
        action: "payment.reject",
        targetType: "payment",
        targetId: payment.id,
        metadata: { reason: notes },
      },
    });

    return true;
  });

  if (!rejected) return { ok: false, message: LOST_RACE };
  return { ok: true, message: "Rejected." };
}
