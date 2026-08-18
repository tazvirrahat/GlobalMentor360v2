import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fulfillZeroTotalQuote, quoteBkashCourses } from "@/lib/checkout";
import { createCoupon } from "@/lib/coupons";
import { db } from "@/lib/db";
import {
  DuplicateBkashTransactionError,
  InFlightPaymentError,
  bkashManualRail,
} from "@/lib/payments";

/**
 * Payment-domain invariants that need a real Postgres: duplicate bKash trx IDs,
 * concurrent submitProof, pending reservations vs the coupon cap, and the
 * in-flight guard on a 100% coupon fulfill.
 */

const run = randomUUID().slice(0, 8);
let instructorId: string;
let courseId: string;
const userIds: string[] = [];

async function newUser(label: string) {
  const id = (
    await db.user.create({
      data: { name: `Inv ${label} ${run}`, email: `payinv-${label}-${run}@example.test` },
      select: { id: true },
    })
  ).id;
  userIds.push(id);
  return id;
}

function proof(transactionId: string) {
  return {
    transactionId,
    phoneNumber: "01712345678",
    paymentDate: new Date().toISOString(),
    reference: null,
  };
}

beforeAll(async () => {
  instructorId = await newUser("instr");
  courseId = (
    await db.course.create({
      data: {
        title: `Inv Course ${run}`,
        slug: `payinv-course-${run}`,
        status: "PUBLISHED",
        instructorId,
        publishedAt: new Date(),
        prices: {
          create: [
            { currency: "BDT", amount: 500000, isActive: true },
            { currency: "USD", amount: 4900, isActive: true },
          ],
        },
      },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  await db.couponRedemption.deleteMany({
    where: { coupon: { code: { startsWith: `INV${run}` } } },
  });
  await db.analyticsEvent.deleteMany({ where: { userId: { in: userIds } } });
  await db.payment.deleteMany({ where: { userId: { in: userIds } } });
  await db.order.deleteMany({ where: { userId: { in: userIds } } });
  await db.enrollment.deleteMany({ where: { courseId } });
  await db.coupon.deleteMany({ where: { code: { startsWith: `INV${run}` } } });
  await db.price.deleteMany({ where: { courseId } });
  await db.course.deleteMany({ where: { id: courseId } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

describe("duplicate bKash transaction ID", () => {
  it("rejects a second submit of the same trx ID, then allows it after reject", async () => {
    const alice = await newUser("alice");
    const bob = await newUser("bob");
    const trx = `TXNINV${run}DUP`;

    const first = await bkashManualRail.submitProof({
      userId: alice,
      courseId,
      amount: 500000,
      proof: proof(trx),
    });

    await expect(
      bkashManualRail.submitProof({
        userId: bob,
        courseId,
        amount: 500000,
        proof: proof(trx),
      }),
    ).rejects.toBeInstanceOf(DuplicateBkashTransactionError);

    await db.payment.update({
      where: { id: first.paymentId },
      data: { status: "FAILED" },
    });

    const second = await bkashManualRail.submitProof({
      userId: bob,
      courseId,
      amount: 500000,
      proof: proof(trx),
    });
    expect(second.paymentId).toBeTruthy();

    const pending = await db.payment.findMany({
      where: { bkashTransactionId: trx, status: "PENDING_VERIFICATION" },
    });
    expect(pending).toHaveLength(1);
    expect(pending[0]?.userId).toBe(bob);
  });
});

describe("concurrent submitProof", () => {
  it("records exactly one pending payment when the same user+course races", async () => {
    const learner = await newUser("race");

    const results = await Promise.allSettled([
      bkashManualRail.submitProof({
        userId: learner,
        courseId,
        amount: 500000,
        proof: proof(`TXNINV${run}R1`),
      }),
      bkashManualRail.submitProof({
        userId: learner,
        courseId,
        amount: 500000,
        proof: proof(`TXNINV${run}R2`),
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(InFlightPaymentError);

    expect(
      await db.payment.count({
        where: {
          userId: learner,
          status: "PENDING_VERIFICATION",
          order: { items: { some: { courseId } } },
        },
      }),
    ).toBe(1);
  });
});

describe("100% coupon with an in-flight bKash payment", () => {
  it("refuses fulfillZeroTotalQuote while a pending proof covers the course", async () => {
    const learner = await newUser("zero");
    await bkashManualRail.submitProof({
      userId: learner,
      courseId,
      amount: 500000,
      proof: proof(`TXNINV${run}Z`),
    });

    const created = await createCoupon({
      code: `INV${run}100`,
      type: "PERCENTAGE",
      value: 100,
      isAdmin: true,
    });
    expect(created.ok).toBe(true);

    const quote = await quoteBkashCourses(learner, [courseId], `INV${run}100`);
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    expect(quote.total).toBe(0);

    await expect(fulfillZeroTotalQuote(learner, quote)).rejects.toBeInstanceOf(InFlightPaymentError);
    expect(
      await db.enrollment.findUnique({
        where: { userId_courseId: { userId: learner, courseId } },
      }),
    ).toBeNull();
  });
});
