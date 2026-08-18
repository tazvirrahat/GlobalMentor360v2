import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Action-layer guards: cart 100% coupon cannot skip a pending bKash payment,
 * and startStripeCheckout refuses when any in-flight payment exists.
 *
 * Stripe is mocked so a missed guard cannot call a live API. Session is faked
 * the same way bkash-approval.test.ts fakes requireRole.
 */

const hoisted = vi.hoisted(() => ({
  learnerId: "",
  learnerEmail: "",
  createSession: vi.fn(async () => ({ id: "cs_test", url: "https://stripe.example/c" })),
}));

vi.mock("@/lib/session", () => ({
  getCurrentUser: async () =>
    hoisted.learnerId
      ? { id: hoisted.learnerId, email: hoisted.learnerEmail, name: "Guard Learner" }
      : null,
  requireUser: async () => {
    if (!hoisted.learnerId) throw new Error("not signed in");
    return { id: hoisted.learnerId, email: hoisted.learnerEmail, name: "Guard Learner" };
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create: hoisted.createSession } };
    webhooks = { constructEvent: () => { throw new Error("unexpected"); } };
  },
}));

const { submitCartBkash } = await import("@/app/cart/actions");
const { startStripeCheckout } = await import("@/app/courses/[slug]/checkout/actions");
const { addToCart } = await import("@/lib/cart");
const { createCoupon } = await import("@/lib/coupons");
const { db } = await import("@/lib/db");
const { bkashManualRail } = await import("@/lib/payments/bkash-manual");

const run = randomUUID().slice(0, 8);
let instructorId: string;
let courseId: string;
let courseSlug: string;

beforeAll(async () => {
  instructorId = (
    await db.user.create({
      data: { name: `Guard Instr ${run}`, email: `guard-instr-${run}@example.test` },
      select: { id: true },
    })
  ).id;
  hoisted.learnerEmail = `guard-learner-${run}@example.test`;
  hoisted.learnerId = (
    await db.user.create({
      data: { name: `Guard Learner ${run}`, email: hoisted.learnerEmail },
      select: { id: true },
    })
  ).id;
  courseSlug = `guard-course-${run}`;
  courseId = (
    await db.course.create({
      data: {
        title: `Guard Course ${run}`,
        slug: courseSlug,
        status: "PUBLISHED",
        instructorId,
        publishedAt: new Date(),
        prices: {
          create: [
            { currency: "BDT", amount: 100000, isActive: true },
            { currency: "USD", amount: 4900, isActive: true },
          ],
        },
      },
      select: { id: true },
    })
  ).id;

  await bkashManualRail.submitProof({
    userId: hoisted.learnerId,
    courseId,
    amount: 100000,
    proof: {
      transactionId: `TXNGRD${run}P`,
      phoneNumber: "01712345678",
      paymentDate: new Date().toISOString(),
      reference: null,
    },
  });
});

afterAll(async () => {
  await db.couponRedemption.deleteMany({
    where: { coupon: { code: { startsWith: `GRD${run}` } } },
  });
  await db.cart.deleteMany({ where: { userId: hoisted.learnerId } });
  await db.analyticsEvent.deleteMany({
    where: { userId: { in: [hoisted.learnerId, instructorId] } },
  });
  await db.payment.deleteMany({ where: { userId: hoisted.learnerId } });
  await db.order.deleteMany({ where: { userId: hoisted.learnerId } });
  await db.enrollment.deleteMany({ where: { courseId } });
  await db.coupon.deleteMany({ where: { code: { startsWith: `GRD${run}` } } });
  await db.price.deleteMany({ where: { courseId } });
  await db.course.deleteMany({ where: { id: courseId } });
  await db.user.deleteMany({ where: { id: { in: [hoisted.learnerId, instructorId] } } });
  await db.$disconnect();
});

describe("cart 100% coupon vs pending bKash", () => {
  it("refuses when course X is already awaiting verification", async () => {
    expect(await addToCart(hoisted.learnerId, courseId)).toEqual({ ok: true });

    const created = await createCoupon({
      code: `GRD${run}100`,
      type: "PERCENTAGE",
      value: 100,
      isAdmin: true,
    });
    expect(created.ok).toBe(true);

    const form = new FormData();
    form.set("couponCode", `GRD${run}100`);
    const result = await submitCartBkash({ status: "idle" }, form);

    expect(result.status).toBe("error");
    expect(result.status === "error" && result.message).toMatch(/awaiting verification/i);
  });
});

describe("startStripeCheckout in-flight guard", () => {
  it("refuses card checkout while a bKash proof is awaiting verification", async () => {
    hoisted.createSession.mockClear();
    const form = new FormData();
    form.set("courseId", courseId);

    await expect(startStripeCheckout(form)).rejects.toThrow(
      new RegExp(`REDIRECT:.*/courses/${courseSlug}/checkout\\?status=in-flight`),
    );
    expect(hoisted.createSession).not.toHaveBeenCalled();
  });
});
