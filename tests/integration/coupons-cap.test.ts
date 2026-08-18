import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { commitCouponReservation, createCoupon, reserveCoupon } from "@/lib/coupons";
import { db } from "@/lib/db";

/**
 * maxRedemptions is claimed when a reservation is committed (admin approval or
 * a zero-total fulfill), not when a pending bKash proof parks a CouponRedemption
 * row. Two learners can both hold a pending reservation under a cap of one;
 * the increment itself has to refuse the extra commit or the coupon oversells.
 */

const run = randomUUID().slice(0, 8);
const userIds: string[] = [];

async function newUser(label: string) {
  const id = (
    await db.user.create({
      data: { name: `Cap ${label} ${run}`, email: `cap-${label}-${run}@example.test` },
      select: { id: true },
    })
  ).id;
  userIds.push(id);
  return id;
}

async function pendingOrder(userId: string) {
  return db.order.create({
    data: {
      userId,
      status: "PENDING",
      currency: "BDT",
      subtotal: 100000,
      total: 100000,
    },
    select: { id: true },
  });
}

beforeAll(async () => {
  await newUser("a");
  await newUser("b");
});

afterAll(async () => {
  await db.couponRedemption.deleteMany({ where: { coupon: { code: { startsWith: `CAP${run}` } } } });
  const orders = await db.order.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  if (orders.length > 0) {
    await db.order.deleteMany({ where: { id: { in: orders.map((order) => order.id) } } });
  }
  // Scoped to this run id. Crashed previous runs leave CAP* debris in local QA;
  // those codes are test-only, but this afterAll does not sweep them (SAVE10
  // and UI QA QAINS* coupons must never be truncated from here).
  await db.coupon.deleteMany({ where: { code: { startsWith: `CAP${run}` } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

describe("coupon maxRedemptions", () => {
  it("does not consume the cap on a pending reservation", async () => {
    const created = await createCoupon({
      code: `CAP${run}HOLD`,
      type: "PERCENTAGE",
      value: 10,
      maxRedemptions: 1,
      isAdmin: true,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const first = await pendingOrder(userIds[0]!);
    await db.$transaction((tx) =>
      reserveCoupon(tx, { couponId: created.id, userId: userIds[0]!, orderId: first.id }),
    );

    const held = await db.coupon.findUniqueOrThrow({ where: { id: created.id } });
    expect(held.redeemedCount).toBe(0);

    await db.$transaction((tx) => commitCouponReservation(tx, first.id));
    const committed = await db.coupon.findUniqueOrThrow({ where: { id: created.id } });
    expect(committed.redeemedCount).toBe(1);
  });

  it("lets two learners reserve under a cap of one, then only one commit takes the slot", async () => {
    const created = await createCoupon({
      code: `CAP${run}RACE`,
      type: "PERCENTAGE",
      value: 10,
      maxRedemptions: 1,
      isAdmin: true,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const orders = await Promise.all(userIds.map((userId) => pendingOrder(userId)));
    await Promise.all(
      userIds.map((userId, index) =>
        db.$transaction((tx) =>
          reserveCoupon(tx, { couponId: created.id, userId, orderId: orders[index]!.id }),
        ),
      ),
    );

    const held = await db.coupon.findUniqueOrThrow({ where: { id: created.id } });
    expect(held.redeemedCount).toBe(0);

    const results = await Promise.allSettled(
      orders.map((order) => db.$transaction((tx) => commitCouponReservation(tx, order.id))),
    );

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);

    const coupon = await db.coupon.findUniqueOrThrow({ where: { id: created.id } });
    expect(coupon.redeemedCount).toBe(1);
  });
});
