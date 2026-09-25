import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addToCart, cartItemCount, getCart, partitionCheckoutLines, removeFromCart } from "@/lib/cart";
import { bkashAmountDue, fulfillZeroTotalQuote, quoteBkashCourses } from "@/lib/checkout";
import { createCoupon, normaliseCouponCode } from "@/lib/coupons";
import { db } from "@/lib/db";
import { grantEnrollment } from "@/lib/enrollment";

const run = randomUUID().slice(0, 8);

let learnerId: string;
let instructorId: string;
let paidId: string;
let freeId: string;

beforeAll(async () => {
  instructorId = (
    await db.user.create({
      data: { name: `Cart Instructor ${run}`, email: `cart-instr-${run}@example.test` },
      select: { id: true },
    })
  ).id;
  learnerId = (
    await db.user.create({
      data: { name: `Cart Learner ${run}`, email: `cart-learner-${run}@example.test` },
      select: { id: true },
    })
  ).id;

  paidId = (
    await db.course.create({
      data: {
        title: `Cart Paid ${run}`,
        slug: `cart-paid-${run}`,
        status: "PUBLISHED",
        instructorId,
        publishedAt: new Date(),
        prices: { create: { currency: "BDT", amount: 100000, isActive: true } },
      },
      select: { id: true },
    })
  ).id;

  freeId = (
    await db.course.create({
      data: {
        title: `Cart Free ${run}`,
        slug: `cart-free-${run}`,
        status: "PUBLISHED",
        instructorId,
        publishedAt: new Date(),
        prices: {
          create: [
            { currency: "USD", amount: 0, isActive: true },
            { currency: "BDT", amount: 0, isActive: true },
          ],
        },
      },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  const orders = await db.order.findMany({
    where: { items: { some: { courseId: { in: [paidId, freeId] } } } },
    select: { id: true },
  });
  const orderIds = orders.map((order) => order.id);
  await db.couponRedemption.deleteMany({
    where: { coupon: { code: { startsWith: `CART${run}` } } },
  });
  if (orderIds.length > 0) {
    await db.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.order.deleteMany({ where: { id: { in: orderIds } } });
  }
  await db.cart.deleteMany({ where: { userId: learnerId } });
  await db.analyticsEvent.deleteMany({ where: { userId: learnerId } });
  await db.coupon.deleteMany({ where: { code: { startsWith: `CART${run}` } } });
  await db.price.deleteMany({ where: { courseId: { in: [paidId, freeId] } } });
  await db.enrollment.deleteMany({ where: { courseId: { in: [paidId, freeId] } } });
  await db.course.deleteMany({ where: { id: { in: [paidId, freeId] } } });
  await db.user.deleteMany({ where: { email: { contains: run } } });
  await db.$disconnect();
});

describe("cart", () => {
  it("adds and removes a published course", async () => {
    expect(await addToCart(learnerId, paidId)).toEqual({ ok: true });
    const cart = await getCart(learnerId);
    expect(cart?.items.map((item) => item.courseId)).toContain(paidId);

    await removeFromCart(learnerId, paidId);
    const empty = await getCart(learnerId);
    expect(empty?.items.map((item) => item.courseId) ?? []).not.toContain(paidId);
  });

  it("refuses a course the learner already owns", async () => {
    await grantEnrollment(learnerId, paidId, "GRANT");
    const result = await addToCart(learnerId, paidId);
    expect(result.ok).toBe(false);
  });

  it("omits unpublished courses from the cart and the badge count", async () => {
    const otherId = (
      await db.user.create({
        data: { name: `Cart Hidden ${run}`, email: `cart-hidden-${run}@example.test` },
        select: { id: true },
      })
    ).id;
    const hiddenId = (
      await db.course.create({
        data: {
          title: `Cart Draft ${run}`,
          slug: `cart-draft-${run}`,
          status: "DRAFT",
          instructorId,
        },
        select: { id: true },
      })
    ).id;

    try {
      expect(await addToCart(otherId, paidId)).toEqual({ ok: true });
      expect(await addToCart(otherId, hiddenId)).toMatchObject({ ok: false });

      const cart = await db.cart.findUniqueOrThrow({
        where: { userId: otherId },
        select: { id: true },
      });
      await db.cartItem.create({ data: { cartId: cart.id, courseId: hiddenId } });

      const visible = await getCart(otherId);
      expect(visible?.items.map((item) => item.courseId)).toEqual([paidId]);
      expect(await cartItemCount(otherId)).toBe(1);
      expect(await cartItemCount(otherId)).toBe(visible?.items.length);
    } finally {
      await db.cart.deleteMany({ where: { userId: otherId } });
      await db.course.delete({ where: { id: hiddenId } });
      await db.user.delete({ where: { id: otherId } });
    }
  });

  it("creates the cart once when two adds race for a new user", async () => {
    const freshId = (
      await db.user.create({
        data: { name: `Cart Race ${run}`, email: `cart-race-${run}@example.test` },
        select: { id: true },
      })
    ).id;

    const results = await Promise.all([addToCart(freshId, paidId), addToCart(freshId, paidId)]);
    expect(results.every((result) => result.ok)).toBe(true);

    const carts = await db.cart.findMany({ where: { userId: freshId } });
    expect(carts).toHaveLength(1);
    const items = await db.cartItem.findMany({ where: { cartId: carts[0]!.id } });
    expect(items).toHaveLength(1);
  });
});

describe("checkout quote", () => {
  it("prices from the BDT row and applies a percentage coupon", async () => {
    const other = (
      await db.user.create({
        data: { name: `Quote Learner ${run}`, email: `quote-learner-${run}@example.test` },
        select: { id: true },
      })
    ).id;

    const created = await createCoupon({
      code: `CART${run}10`,
      type: "PERCENTAGE",
      value: 10,
      isAdmin: true,
    });
    expect(created.ok).toBe(true);

    const quote = await quoteBkashCourses(other, [paidId], `cart${run}10`);
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    expect(quote.subtotal).toBe(100000);
    expect(quote.discount).toBe(10000);
    expect(quote.total).toBe(90000);
    expect(bkashAmountDue(quote)).toBe(90000);
    expect(bkashAmountDue(quote)).not.toBe(quote.lines[0]?.unitPrice);
    expect(quote.coupon?.code).toBe(normaliseCouponCode(`cart${run}10`));

    await db.user.delete({ where: { id: other } });
  });

  it("quotes a 100 percent coupon down to zero and grants via fulfillZeroTotalQuote", async () => {
    const other = (
      await db.user.create({
        data: { name: `Fulloff Learner ${run}`, email: `fulloff-learner-${run}@example.test` },
        select: { id: true },
      })
    ).id;

    const created = await createCoupon({
      code: `CART${run}100`,
      type: "PERCENTAGE",
      value: 100,
      isAdmin: true,
    });
    expect(created.ok).toBe(true);

    const quote = await quoteBkashCourses(other, [paidId], `CART${run}100`);
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    expect(quote.total).toBe(0);

    await fulfillZeroTotalQuote(other, quote);
    const enrollment = await db.enrollment.findUnique({
      where: { userId_courseId: { userId: other, courseId: paidId } },
    });
    expect(enrollment?.revokedAt).toBeNull();
    if (created.ok) {
      const coupon = await db.coupon.findUniqueOrThrow({ where: { id: created.id } });
      expect(coupon.redeemedCount).toBe(1);
    }

    await db.couponRedemption.deleteMany({ where: { userId: other } });
    await db.payment.deleteMany({ where: { userId: other } });
    await db.orderItem.deleteMany({ where: { order: { userId: other } } });
    await db.order.deleteMany({ where: { userId: other } });
    await db.enrollment.deleteMany({ where: { userId: other } });
    await db.analyticsEvent.deleteMany({ where: { userId: other } });
    await db.user.delete({ where: { id: other } });
  });

  it("splits free courses out of the payable set", () => {
    const split = partitionCheckoutLines([
      {
        courseId: freeId,
        title: "Free",
        slug: "free",
        thumbnailUrl: null,
        addedAt: new Date(),
        prices: [
          { amount: 0, currency: "USD" },
          { amount: 0, currency: "BDT" },
        ],
        isFree: true,
        enrolled: false,
      },
    ]);
    expect(split.free.map((item) => item.courseId)).toEqual([freeId]);
    expect(split.payable).toEqual([]);
  });
});

describe("coupon codes", () => {
  it("normalises case so SAVE10 and save10 are the same code", () => {
    expect(normaliseCouponCode("save10")).toBe("SAVE10");
  });
});
