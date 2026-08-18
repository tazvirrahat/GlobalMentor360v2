import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getLearnerOrder, listLearnerOrders } from "@/lib/orders";

/**
 * The purchase record.
 *
 * The property worth pinning is negative: an order carries what someone paid,
 * how, and a payment reference, so a learner must never reach another learner's.
 * Both reads scope by userId inside the `where` rather than filtering after the
 * fetch, and these tests fail if that ever becomes a post-hoc check.
 */

const run = randomUUID().slice(0, 8);
let buyerId: string;
let otherId: string;
let instructorId: string;
let courseId: string;
let buyerOrderId: string;
let otherOrderId: string;

async function makeUser(label: string) {
  return (
    await db.user.create({
      data: { name: `${label} ${run}`, email: `${label}-${run}@example.test` },
      select: { id: true },
    })
  ).id;
}

async function makePaidOrder(userId: string, reference: string) {
  const order = await db.order.create({
    data: {
      userId,
      status: "PAID",
      currency: "USD",
      subtotal: 4900,
      total: 4900,
      paidAt: new Date(),
      items: { create: { courseId, unitPrice: 4900 } },
    },
    select: { id: true },
  });

  await db.payment.create({
    data: {
      orderId: order.id,
      userId,
      method: "STRIPE",
      status: "COMPLETED",
      amount: 4900,
      currency: "USD",
      stripePaymentIntentId: reference,
      paidAt: new Date(),
    },
  });

  return order.id;
}

beforeAll(async () => {
  buyerId = await makeUser("orders-buyer");
  otherId = await makeUser("orders-other");
  instructorId = await makeUser("orders-instructor");

  courseId = (
    await db.course.create({
      data: {
        title: `Orders Course ${run}`,
        slug: `orders-course-${run}`,
        status: "PUBLISHED",
        instructorId,
        publishedAt: new Date(),
      },
      select: { id: true },
    })
  ).id;

  buyerOrderId = await makePaidOrder(buyerId, `pi_${run}_buyer`);
  otherOrderId = await makePaidOrder(otherId, `pi_${run}_other`);
});

afterAll(async () => {
  await db.payment.deleteMany({ where: { userId: { in: [buyerId, otherId] } } });
  await db.order.deleteMany({ where: { userId: { in: [buyerId, otherId] } } });
  await db.course.deleteMany({ where: { id: courseId } });
  await db.user.deleteMany({ where: { id: { in: [buyerId, otherId, instructorId] } } });
  await db.$disconnect();
});

describe("listLearnerOrders", () => {
  it("returns the learner's own orders and nobody else's", async () => {
    const orders = await listLearnerOrders(buyerId);
    const ids = orders.items.map((order) => order.id);

    expect(ids).toContain(buyerOrderId);
    expect(ids).not.toContain(otherOrderId);
  });

  it("carries the line items and the payment reference", async () => {
    const orders = await listLearnerOrders(buyerId);
    const order = orders.items.find((row) => row.id === buyerOrderId);

    expect(order?.items[0]?.courseTitle).toBe(`Orders Course ${run}`);
    expect(order?.total).toBe(4900);
    // Stripe's identifier is what their support asks for; bKash surfaces the
    // transaction id the learner typed in instead.
    expect(order?.payments[0]?.reference).toBe(`pi_${run}_buyer`);
  });
});

describe("getLearnerOrder", () => {
  it("returns the learner's own receipt", async () => {
    const order = await getLearnerOrder(buyerId, buyerOrderId);
    expect(order?.id).toBe(buyerOrderId);
  });

  it("returns null for another learner's order id", async () => {
    // The id is real and the order exists — what must not happen is this learner
    // reading it. A post-fetch check would have the row in hand first.
    const order = await getLearnerOrder(buyerId, otherOrderId);
    expect(order).toBeNull();
  });

  it("returns null for an id that does not exist", async () => {
    expect(await getLearnerOrder(buyerId, randomUUID())).toBeNull();
  });
});
