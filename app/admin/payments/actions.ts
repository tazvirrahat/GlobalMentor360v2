"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { grantEnrollment } from "@/lib/enrollment";
import { requireRole } from "@/lib/session";

export type ReviewState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

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

/**
 * Approving is the manual rail's equivalent of a Stripe webhook firing.
 *
 * The payment update and the enrollment grant happen in one transaction: a
 * payment marked COMPLETED without the learner gaining access is exactly the
 * failure the prior codebase shipped (docs/PRIOR-ART.md).
 */
export async function approvePayment(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const admin = await requireRole("ADMIN");

  const paymentId = String(formData.get("paymentId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      userId: true,
      status: true,
      order: { select: { id: true, items: { select: { courseId: true } } } },
    },
  });

  if (!payment) return { status: "error", message: "Payment not found." };

  if (payment.status !== "PENDING_VERIFICATION") {
    // Fast path for a stale queue — a courtesy, not the guard. The guard is the
    // status filter in the write below.
    return { status: "error", message: `Already ${payment.status.toLowerCase()}.` };
  }

  const approved = await db.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: "PENDING_VERIFICATION" },
      data: {
        status: "COMPLETED",
        // The DB constraint rejects COMPLETED without this. Setting it here is
        // not belt-and-braces — it is the only way the write succeeds.
        verifiedById: admin.id,
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

    for (const item of payment.order.items) {
      await grantEnrollment(payment.userId, item.courseId, "PURCHASE", tx);
    }

    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        action: "payment.approve",
        targetType: "payment",
        targetId: payment.id,
        metadata: { orderId: payment.order.id },
      },
    });

    return true;
  });

  // Revalidated either way: the loser's queue is stale and refreshing it drops
  // the row the winner just handled.
  revalidatePath("/admin/payments");

  if (!approved) return { status: "error", message: LOST_RACE };
  return { status: "done", message: "Approved and enrolled." };
}

export async function rejectPayment(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const admin = await requireRole("ADMIN");

  const paymentId = String(formData.get("paymentId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!notes) {
    // A rejection the learner cannot understand generates a support ticket.
    return { status: "error", message: "Give a reason — the learner will see it." };
  }

  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, status: true, orderId: true },
  });

  if (!payment) return { status: "error", message: "Payment not found." };
  if (payment.status !== "PENDING_VERIFICATION") {
    return { status: "error", message: `Already ${payment.status.toLowerCase()}.` };
  }

  const rejected = await db.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: "PENDING_VERIFICATION" },
      data: { status: "FAILED", verificationNotes: notes, verifiedById: admin.id, verifiedAt: new Date() },
    });

    // Same race as approvePayment, and the same arbitration. Losing here matters
    // more, not less: the winner may have approved, and overwriting the order
    // would strand a learner who has already been enrolled.
    if (claimed.count === 0) return false;

    await tx.order.update({ where: { id: payment.orderId }, data: { status: "FAILED" } });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        action: "payment.reject",
        targetType: "payment",
        targetId: payment.id,
        metadata: { reason: notes },
      },
    });

    return true;
  });

  revalidatePath("/admin/payments");

  if (!rejected) return { status: "error", message: LOST_RACE };
  return { status: "done", message: "Rejected." };
}
