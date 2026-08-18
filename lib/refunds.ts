import { db } from "@/lib/db";
import { revokeEnrollment } from "@/lib/enrollment";
import { notify } from "@/lib/notifications";
import { clampPage, pageCount, skipTake, type Paged } from "@/lib/pagination";

/**
 * Admin refunds. Money does not move here — Stripe keys and bKash merchant
 * payouts are out of band. The product rule is access: a refunded purchase
 * calls revokeEnrollment, the same path chargebacks will use.
 *
 * The order status in the UPDATE WHERE is the guard. Two admins clicking
 * refund on the same paid order cannot both revoke, for the same reason
 * two approvals cannot both enroll.
 *
 * Coupon redemptions are kept on purpose: a promo code is consumed when the
 * purchase completes (bKash approval or a zero-total fulfill), and a refund
 * does not return that slot. The learner cannot reuse the code after a refund.
 */

export const REFUND_PAGE_SIZE = 40;

export async function listRefundableOrders(page?: string | number) {
  const where = { status: "PAID" as const };
  const total = await db.order.count({ where });
  const current = clampPage(page ?? 1, total, REFUND_PAGE_SIZE);
  const { skip, take } = skipTake(current, REFUND_PAGE_SIZE);
  const items = await db.order.findMany({
    where,
    orderBy: { paidAt: "desc" },
    skip,
    take,
    select: {
      id: true,
      total: true,
      currency: true,
      paidAt: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
      items: { select: { course: { select: { title: true } } } },
    },
  });

  return { items, total, page: current, pageCount: pageCount(total, REFUND_PAGE_SIZE) } satisfies Paged<
    (typeof items)[number]
  >;
}

export async function processAdminRefund(
  actorId: string,
  orderId: string,
  reason?: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const note = reason?.trim() || null;

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      userId: true,
      items: {
        select: { id: true, courseId: true, unitPrice: true, discountApplied: true },
      },
    },
  });

  if (!order) return { ok: false, message: "Order not found." };
  if (order.status === "REFUNDED" || order.status === "PARTIALLY_REFUNDED") {
    return { ok: false, message: "This order has already been refunded." };
  }
  if (order.status !== "PAID") {
    return { ok: false, message: "Only a paid order can be refunded." };
  }

  const claimed = await db.$transaction(async (tx) => {
    const moved = await tx.order.updateMany({
      where: { id: order.id, status: "PAID" },
      data: { status: "REFUNDED" },
    });
    if (moved.count === 0) return false;

    await tx.payment.updateMany({
      where: { orderId: order.id, status: "COMPLETED" },
      data: { status: "REFUNDED" },
    });

    for (const item of order.items) {
      await tx.refund.create({
        data: {
          orderItemId: item.id,
          amount: Math.max(0, item.unitPrice - item.discountApplied),
          reason: note,
          status: "PROCESSED",
          processedAt: new Date(),
        },
      });
      await revokeEnrollment(order.userId, item.courseId, tx);
    }

    await tx.auditLog.create({
      data: {
        actorId,
        action: "order.refund",
        targetType: "order",
        targetId: order.id,
        metadata: { reason: note },
      },
    });

    return true;
  });

  if (!claimed) return { ok: false, message: "This order has already been refunded." };

  await notify(order.userId, "payment", {
    title: "Refund processed",
    body: "Access from this purchase has been removed.",
    href: `/orders/${order.id}`,
  });

  return { ok: true };
}
