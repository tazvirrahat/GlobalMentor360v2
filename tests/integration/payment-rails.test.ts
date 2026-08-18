import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { bkashManualRail } from "@/lib/payments/bkash-manual";
import { stripeRail } from "@/lib/payments/stripe";
import { isEnrolled } from "@/lib/entitlement";
import { processAdminRefund } from "@/lib/refunds";
import { signedEvent } from "./signed-event";

/**
 * The checks docs/TECH-SPEC.md calls out and nothing exercised.
 *
 * These run against the real database through the real rails, deliberately with
 * no browser. A Playwright test cannot prove "the browser is not required" — the
 * proposition is about what happens when the browser is *gone*. So the subject
 * here is stripeRail.confirm, which is the whole webhook path: verify the
 * signature, mark the payment COMPLETED and the order PAID, grant the enrollment.
 *
 * Signatures come from ./signed-event, which builds them locally — no Stripe
 * account, no network. Convergence with the bKash rail is covered in
 * bkash-approval.test.ts, which drives the admin action rather than the shared
 * grantEnrollment both rails already call.
 */

const run = randomUUID().slice(0, 8);
let userId: string;
let instructorId: string;
let courseId: string;

async function createPendingStripeOrder(amount = 4900) {
  const order = await db.order.create({
    data: {
      userId,
      status: "PENDING",
      currency: "USD",
      subtotal: amount,
      total: amount,
      items: { create: { courseId, unitPrice: amount } },
    },
  });
  const payment = await db.payment.create({
    data: {
      orderId: order.id,
      userId,
      method: "STRIPE",
      status: "PENDING",
      amount,
      currency: "USD",
    },
  });
  return { orderId: order.id, paymentId: payment.id };
}

beforeAll(async () => {
  instructorId = (
    await db.user.create({
      data: { name: `Probe Instructor ${run}`, email: `probe-instructor-${run}@example.test` },
      select: { id: true },
    })
  ).id;
  userId = (
    await db.user.create({
      data: { name: `Probe Learner ${run}`, email: `probe-learner-${run}@example.test` },
      select: { id: true },
    })
  ).id;
  courseId = (
    await db.course.create({
      data: {
        title: `Probe Course ${run}`,
        slug: `probe-course-${run}`,
        status: "PUBLISHED",
        instructorId,
        publishedAt: new Date(),
      },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  // Order matters: payments and orders reference the user, enrollments the course.
  // analytics_events has no FK, so it must be deleted explicitly or it orphans.
  await db.analyticsEvent.deleteMany({ where: { userId: { in: [userId, instructorId] } } });
  await db.payment.deleteMany({ where: { userId } });
  await db.order.deleteMany({ where: { userId } });
  await db.enrollment.deleteMany({ where: { courseId } });
  await db.course.deleteMany({ where: { id: courseId } });
  await db.user.deleteMany({ where: { id: { in: [userId, instructorId] } } });
  await db.$disconnect();
});

beforeEach(async () => {
  await db.enrollment.deleteMany({ where: { courseId } });
  await db.payment.deleteMany({ where: { userId } });
  await db.order.deleteMany({ where: { userId } });
  await db.course.update({ where: { id: courseId }, data: { enrollmentCount: 0 } });
});

describe("payment without redirect (invariant 5)", () => {
  it("enrolls from the webhook alone, with no browser involved", async () => {
    const { orderId, paymentId } = await createPendingStripeOrder();
    expect(await isEnrolled(userId, courseId)).toBe(false);

    // The learner pays and closes the tab. Only this arrives.
    const result = await stripeRail.confirm(
      signedEvent({
        eventId: `evt_${run}_1`,
        sessionId: `cs_${run}_1`,
        paymentIntentId: `pi_${run}_1`,
        paymentStatus: "paid",
        metadata: { orderId, paymentId, courseId, userId },
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.paid).toBe(true);
    expect(await isEnrolled(userId, courseId)).toBe(true);

    const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe("COMPLETED");
    expect(payment.stripePaymentIntentId).toBe(`pi_${run}_1`);

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("PAID");
  });

  it("refuses an unsigned body, so a forged webhook cannot grant access", async () => {
    const { orderId, paymentId } = await createPendingStripeOrder();

    const forged = await stripeRail.confirm({
      rawBody: JSON.stringify({
        id: "evt_forged",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_forged",
            payment_status: "paid",
            payment_intent: "pi_forged",
            metadata: { orderId, paymentId, courseId, userId },
          },
        },
      }),
      headers: { "stripe-signature": "t=1,v1=deadbeef" },
    });

    expect(forged).toBeNull();
    expect(await isEnrolled(userId, courseId)).toBe(false);
  });

  it("grants nothing while the money has not moved", async () => {
    const { orderId, paymentId } = await createPendingStripeOrder();

    // Delayed payment methods fire `completed` with payment_status unpaid.
    const result = await stripeRail.confirm(
      signedEvent({
        eventId: `evt_${run}_unpaid`,
        sessionId: `cs_${run}_unpaid`,
        paymentIntentId: `pi_${run}_unpaid`,
        paymentStatus: "unpaid",
        metadata: { orderId, paymentId, courseId, userId },
      }),
    );

    expect(result?.paid).toBe(false);
    expect(await isEnrolled(userId, courseId)).toBe(false);
  });
});

describe("webhook idempotency", () => {
  it("does not double-enroll or double-count when Stripe retries", async () => {
    const { orderId, paymentId } = await createPendingStripeOrder();
    const event = signedEvent({
      eventId: `evt_${run}_retry`,
      sessionId: `cs_${run}_retry`,
      paymentIntentId: `pi_${run}_retry`,
      paymentStatus: "paid",
      metadata: { orderId, paymentId, courseId, userId },
    });

    await stripeRail.confirm(event);
    await stripeRail.confirm(event);
    await stripeRail.confirm(event);

    const enrollments = await db.enrollment.count({ where: { userId, courseId } });
    expect(enrollments).toBe(1);

    // The display counter is the part a retry would inflate.
    const course = await db.course.findUniqueOrThrow({
      where: { id: courseId },
      select: { enrollmentCount: true },
    });
    expect(course.enrollmentCount).toBe(1);
  });
});

describe("Stripe fulfill guards", () => {
  it("does not revive enrollment when a webhook retries after a refund", async () => {
    const { orderId, paymentId } = await createPendingStripeOrder();
    const event = signedEvent({
      eventId: `evt_${run}_refund`,
      sessionId: `cs_${run}_refund`,
      paymentIntentId: `pi_${run}_refund`,
      paymentStatus: "paid",
      metadata: { orderId, paymentId, courseId, userId },
    });

    await stripeRail.confirm(event);
    expect(await isEnrolled(userId, courseId)).toBe(true);

    expect(await processAdminRefund(instructorId, orderId, "Chargeback")).toEqual({ ok: true });
    expect(await isEnrolled(userId, courseId)).toBe(false);

    await stripeRail.confirm(event);
    expect(await isEnrolled(userId, courseId)).toBe(false);

    const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe("REFUNDED");

    const replay = await stripeRail.confirm(event);
    expect(replay?.paid).toBe(false);
    expect(replay?.retry).toBeFalsy();
    expect(await isEnrolled(userId, courseId)).toBe(false);
  });

  it("does not grant when session.amount_total disagrees with the payment row", async () => {
    const { orderId, paymentId } = await createPendingStripeOrder();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await stripeRail.confirm(
      signedEvent({
        eventId: `evt_${run}_amt`,
        sessionId: `cs_${run}_amt`,
        paymentIntentId: `pi_${run}_amt`,
        paymentStatus: "paid",
        amountTotal: 99,
        metadata: { orderId, paymentId, courseId, userId },
      }),
    );
    log.mockRestore();

    expect(result?.paid).toBe(false);
    expect(result?.retry).toBe(true);
    expect(await isEnrolled(userId, courseId)).toBe(false);
    const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe("PENDING");
  });

  it("grants every order item, not only metadata.courseId", async () => {
    const extraId = (
      await db.course.create({
        data: {
          title: `Probe Extra ${run}`,
          slug: `probe-extra-${run}`,
          status: "PUBLISHED",
          instructorId,
          publishedAt: new Date(),
        },
        select: { id: true },
      })
    ).id;

    try {
      const order = await db.order.create({
        data: {
          userId,
          status: "PENDING",
          currency: "USD",
          subtotal: 9800,
          total: 9800,
          items: {
            create: [
              { courseId, unitPrice: 4900 },
              { courseId: extraId, unitPrice: 4900 },
            ],
          },
        },
      });
      const payment = await db.payment.create({
        data: {
          orderId: order.id,
          userId,
          method: "STRIPE",
          status: "PENDING",
          amount: 9800,
          currency: "USD",
        },
      });

      await stripeRail.confirm(
        signedEvent({
          eventId: `evt_${run}_multi`,
          sessionId: `cs_${run}_multi`,
          paymentIntentId: `pi_${run}_multi`,
          paymentStatus: "paid",
          amountTotal: 9800,
          metadata: {
            orderId: order.id,
            paymentId: payment.id,
            courseId,
            userId,
          },
        }),
      );

      expect(await isEnrolled(userId, courseId)).toBe(true);
      expect(await isEnrolled(userId, extraId)).toBe(true);
    } finally {
      await db.enrollment.deleteMany({ where: { courseId: extraId } });
      await db.payment.deleteMany({
        where: { order: { items: { some: { courseId: extraId } } } },
      });
      await db.order.deleteMany({ where: { items: { some: { courseId: extraId } } } });
      await db.course.delete({ where: { id: extraId } });
    }
  });
});

describe("bKash manual rail", () => {
  it("records the claim without granting anything", async () => {
    const { paymentId } = await bkashManualRail.submitProof({
      userId,
      courseId,
      amount: 500000,
      proof: {
        transactionId: `TXN${run}`,
        phoneNumber: "01712345678",
        paymentDate: new Date().toISOString(),
        reference: null,
      },
    });

    const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe("PENDING_VERIFICATION");
    expect(payment.verifiedById).toBeNull();

    // The whole point of the manual rail: money claimed, access withheld.
    expect(await isEnrolled(userId, courseId)).toBe(false);
  });

  it("cannot reach COMPLETED without a verifier, even from application code", async () => {
    const { paymentId } = await bkashManualRail.submitProof({
      userId,
      courseId,
      amount: 500000,
      proof: {
        transactionId: `TXN${run}B`,
        phoneNumber: "01712345678",
        paymentDate: new Date().toISOString(),
        reference: null,
      },
    });

    // The service layer cannot bypass the CHECK constraint. That is the point of
    // enforcing it in the database rather than in a service method.
    await expect(
      db.payment.update({ where: { id: paymentId }, data: { status: "COMPLETED" } }),
    ).rejects.toThrow();
  });
});
