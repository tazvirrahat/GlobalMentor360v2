import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { grantEnrollment } from "@/lib/enrollment";
import { isEnrolled } from "@/lib/entitlement";
import { listRefundableOrders, processAdminRefund } from "@/lib/refunds";

/**
 * An admin refund records the Refund row and revokes access. It does not move
 * money at Stripe or bKash — that is out-of-band. Enrollment is the source of
 * truth (invariant 1); revokeEnrollment is the only access write.
 */

const run = randomUUID().slice(0, 8);
let adminId: string;
let instructorId: string;
let learnerId: string;
let courseId: string;

async function paidOrder() {
  const order = await db.order.create({
    data: {
      userId: learnerId,
      status: "PAID",
      currency: "BDT",
      subtotal: 100000,
      total: 100000,
      paidAt: new Date(),
      items: { create: { courseId, unitPrice: 100000 } },
    },
  });
  await db.payment.create({
    data: {
      orderId: order.id,
      userId: learnerId,
      method: "BKASH",
      status: "COMPLETED",
      amount: 100000,
      currency: "BDT",
      bkashTransactionId: `TXN${run}${Math.random().toString(36).slice(2, 8)}`,
      bkashPhoneNumber: "01712345678",
      verifiedById: adminId,
      verifiedAt: new Date(),
      paidAt: new Date(),
    },
  });
  return order.id;
}

beforeAll(async () => {
  adminId = (
    await db.user.create({
      data: { name: `Refund Admin ${run}`, email: `refund-admin-${run}@example.test` },
      select: { id: true },
    })
  ).id;
  instructorId = (
    await db.user.create({
      data: { name: `Refund Instructor ${run}`, email: `refund-instr-${run}@example.test` },
      select: { id: true },
    })
  ).id;
  learnerId = (
    await db.user.create({
      data: { name: `Refund Learner ${run}`, email: `refund-learner-${run}@example.test` },
      select: { id: true },
    })
  ).id;
  courseId = (
    await db.course.create({
      data: {
        title: `Refund Course ${run}`,
        slug: `refund-course-${run}`,
        status: "PUBLISHED",
        instructorId,
        publishedAt: new Date(),
      },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  const orders = await db.order.findMany({
    where: { userId: learnerId },
    select: { id: true, items: { select: { id: true } } },
  });
  const itemIds = orders.flatMap((order) => order.items.map((item) => item.id));
  if (itemIds.length > 0) {
    await db.refund.deleteMany({ where: { orderItemId: { in: itemIds } } });
  }
  if (orders.length > 0) {
    const orderIds = orders.map((order) => order.id);
    await db.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.order.deleteMany({ where: { id: { in: orderIds } } });
  }
  await db.enrollment.deleteMany({ where: { courseId } });
  await db.auditLog.deleteMany({ where: { actorId: adminId } });
  await db.notification.deleteMany({ where: { userId: learnerId } });
  await db.analyticsEvent.deleteMany({
    where: { userId: { in: [adminId, instructorId, learnerId] } },
  });
  await db.course.delete({ where: { id: courseId } });
  await db.user.deleteMany({ where: { id: { in: [adminId, instructorId, learnerId] } } });
  await db.$disconnect();
});

describe("processAdminRefund", () => {
  it("revokes enrollment and records a processed refund", async () => {
    await grantEnrollment(learnerId, courseId, "PURCHASE");
    expect(await isEnrolled(learnerId, courseId)).toBe(true);

    const orderId = await paidOrder();
    const result = await processAdminRefund(adminId, orderId, "Learner requested a refund.");
    expect(result).toEqual({ ok: true });

    expect(await isEnrolled(learnerId, courseId)).toBe(false);

    const order = await db.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        status: true,
        payments: { select: { status: true } },
        items: { select: { refunds: { select: { amount: true, status: true, reason: true } } } },
      },
    });
    expect(order.status).toBe("REFUNDED");
    expect(order.payments.every((payment) => payment.status === "REFUNDED")).toBe(true);
    expect(order.items[0]?.refunds).toEqual([
      { amount: 100000, status: "PROCESSED", reason: "Learner requested a refund." },
    ]);

    const course = await db.course.findUniqueOrThrow({
      where: { id: courseId },
      select: { enrollmentCount: true },
    });
    expect(course.enrollmentCount).toBe(0);
  });

  it("does not refund the same paid order twice", async () => {
    await grantEnrollment(learnerId, courseId, "PURCHASE");
    const orderId = await paidOrder();
    expect(await processAdminRefund(adminId, orderId, "First")).toEqual({ ok: true });
    const again = await processAdminRefund(adminId, orderId, "Second");
    expect(again.ok).toBe(false);
  });

  it("refuses an order that was never paid", async () => {
    const order = await db.order.create({
      data: {
        userId: learnerId,
        status: "PENDING",
        currency: "BDT",
        subtotal: 100000,
        total: 100000,
        items: { create: { courseId, unitPrice: 100000 } },
      },
    });
    const result = await processAdminRefund(adminId, order.id, "Too soon");
    expect(result).toEqual({ ok: false, message: "Only a paid order can be refunded." });
    expect(await isEnrolled(learnerId, courseId)).toBe(false);
  });
});

describe("listRefundableOrders search", () => {
  it("finds a paid order by learner email, learner name or course title", async () => {
    const orderId = await paidOrder();
    for (const query of [`refund-learner-${run}`, `REFUND LEARNER ${run}`, `refund course ${run}`]) {
      const { items } = await listRefundableOrders(query);
      expect(items.map((order) => order.id)).toContain(orderId);
    }
    const { items } = await listRefundableOrders(`no-such-learner-${run}`);
    expect(items).toHaveLength(0);
  });
});
