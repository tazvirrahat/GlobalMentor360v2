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
    // Someone else got here first. Not an error worth alarming about.
    return { status: "error", message: `Already ${payment.status.toLowerCase()}.` };
  }

  await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
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
  });

  revalidatePath("/admin/payments");
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

  await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", verificationNotes: notes, verifiedById: admin.id, verifiedAt: new Date() },
    });
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
  });

  revalidatePath("/admin/payments");
  return { status: "done", message: "Rejected." };
}
