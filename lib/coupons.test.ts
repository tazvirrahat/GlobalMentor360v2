import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import {
  applyCouponToItems,
  commitCouponReservation,
  couponAppliesToCart,
  createCoupon,
  normaliseCouponCode,
  releaseCouponReservation,
  reserveCoupon,
  resolveCouponScope,
} from "./coupons";
import type { CouponRecord } from "./coupons";

const { couponCreate } = vi.hoisted(() => ({
  couponCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    coupon: { create: couponCreate },
  },
}));

function coupon(overrides: Partial<CouponRecord> = {}): CouponRecord {
  return {
    id: "c1",
    code: "SAVE20",
    type: "PERCENTAGE",
    value: 20,
    courseId: null,
    maxRedemptions: null,
    redeemedCount: 0,
    validFrom: null,
    validUntil: null,
    isActive: true,
    ...overrides,
  };
}

const items = [
  { courseId: "a", unitPrice: 1000 },
  { courseId: "b", unitPrice: 2000 },
];

describe("normaliseCouponCode", () => {
  it("uppercases and trims", () => {
    expect(normaliseCouponCode("  save20 ")).toBe("SAVE20");
  });
});

describe("applyCouponToItems", () => {
  it("applies a percentage independently to each line", () => {
    const result = applyCouponToItems(items, coupon());
    expect(result.discount).toBe(600);
    expect(result.perItem).toEqual({ a: 200, b: 400 });
  });

  it("caps a percentage at 100 so a total cannot go negative", () => {
    const result = applyCouponToItems(items, coupon({ value: 150 }));
    expect(result.discount).toBe(3000);
    expect(result.perItem).toEqual({ a: 1000, b: 2000 });
  });

  it("consumes a fixed amount from eligible lines in order", () => {
    const result = applyCouponToItems(items, coupon({ type: "FIXED", value: 1500 }));
    expect(result.discount).toBe(1500);
    expect(result.perItem).toEqual({ a: 1000, b: 500 });
  });

  it("caps a fixed coupon at the eligible subtotal", () => {
    const result = applyCouponToItems(items, coupon({ type: "FIXED", value: 99999 }));
    expect(result.discount).toBe(3000);
    expect(result.perItem).toEqual({ a: 1000, b: 2000 });
  });

  it("only discounts the course a scoped coupon names", () => {
    const result = applyCouponToItems(items, coupon({ courseId: "b", value: 10 }));
    expect(result.discount).toBe(200);
    expect(result.perItem).toEqual({ a: 0, b: 200 });
  });

  it("discounts nothing when the scoped course is not in the cart", () => {
    const result = applyCouponToItems(items, coupon({ courseId: "z" }));
    expect(result.discount).toBe(0);
    expect(result.perItem).toEqual({ a: 0, b: 0 });
  });
});

describe("couponAppliesToCart", () => {
  it("accepts a global coupon on any cart", () => {
    expect(couponAppliesToCart(coupon(), ["a"])).toBe(true);
  });

  it("rejects a course-scoped coupon whose course is absent", () => {
    expect(couponAppliesToCart(coupon({ courseId: "z" }), ["a", "b"])).toBe(false);
  });
});

describe("quoted amount to send", () => {
  it("is subtotal minus coupon, never the raw subtotal", () => {
    const subtotal = items.reduce((sum, item) => sum + item.unitPrice, 0);
    const { discount } = applyCouponToItems(items, coupon());
    const amountToSend = subtotal - discount;
    expect(amountToSend).toBe(2400);
    expect(amountToSend).not.toBe(subtotal);
  });
});

describe("resolveCouponScope", () => {
  it("refuses a catalog-wide coupon from a non-admin", () => {
    expect(resolveCouponScope({ requestedCourseId: "all", isAdmin: false })).toEqual({
      ok: false,
      message: "Only an admin can create a coupon that applies to every course.",
    });
    expect(resolveCouponScope({ requestedCourseId: null, isAdmin: false }).ok).toBe(false);
    expect(resolveCouponScope({ requestedCourseId: "", isAdmin: false }).ok).toBe(false);
  });

  it("allows an admin to mint a catalog-wide coupon", () => {
    expect(resolveCouponScope({ requestedCourseId: "all", isAdmin: true })).toEqual({
      ok: true,
      courseId: null,
    });
  });

  it("passes a named course through for ownership checks", () => {
    expect(resolveCouponScope({ requestedCourseId: "course-1", isAdmin: false })).toEqual({
      ok: true,
      courseId: "course-1",
    });
  });
});

describe("createCoupon catalog-wide rule", () => {
  beforeEach(() => {
    couponCreate.mockReset();
    couponCreate.mockResolvedValue({ id: "c1" });
  });

  it("refuses a catalog-wide coupon when the caller is not an admin", async () => {
    const result = await createCoupon({
      code: "WORLD20",
      type: "PERCENTAGE",
      value: 20,
    });
    expect(result).toEqual({
      ok: false,
      message: "Only an admin can create a coupon that applies to every course.",
    });
    expect(couponCreate).not.toHaveBeenCalled();
  });

  it("lets an admin mint a catalog-wide coupon", async () => {
    const result = await createCoupon({
      code: "WORLD20",
      type: "PERCENTAGE",
      value: 20,
      isAdmin: true,
    });
    expect(result).toEqual({ ok: true, id: "c1" });
    expect(couponCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ code: "WORLD20", courseId: null }),
      }),
    );
  });

  it("does not require admin when a course id is named (ownership stays with the caller)", async () => {
    const result = await createCoupon({
      code: "SAVE20",
      type: "PERCENTAGE",
      value: 20,
      courseId: "course-1",
    });
    expect(result).toEqual({ ok: true, id: "c1" });
    expect(couponCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ courseId: "course-1" }),
      }),
    );
  });
});

function fakeCouponTx() {
  const redemptions = new Map<string, { id: string; couponId: string; userId: string; orderId: string }>();
  const counts = new Map<string, number>();
  const pair = (couponId: string, userId: string) => `${couponId}:${userId}`;

  const client = {
    couponRedemption: {
      create: ({
        data,
      }: {
        data: { couponId: string; userId: string; orderId: string };
      }) => {
        const key = pair(data.couponId, data.userId);
        if (redemptions.has(key)) {
          return Promise.reject(new Error("Unique (couponId, userId) violated"));
        }
        const row = { id: `r-${redemptions.size + 1}`, ...data };
        redemptions.set(key, row);
        return Promise.resolve(row);
      },
      findMany: ({ where }: { where: { orderId: string } }) => {
        return Promise.resolve([...redemptions.values()].filter((row) => row.orderId === where.orderId));
      },
      deleteMany: ({ where }: { where: { orderId: string } }) => {
        let count = 0;
        for (const [key, row] of redemptions) {
          if (row.orderId === where.orderId) {
            redemptions.delete(key);
            count += 1;
          }
        }
        return Promise.resolve({ count });
      },
    },
    $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      const couponId = String(values[0] ?? "");
      if (sql.includes("+ 1")) {
        counts.set(couponId, (counts.get(couponId) ?? 0) + 1);
        return Promise.resolve(1);
      }
      if (sql.includes("- 1")) {
        counts.set(couponId, Math.max(0, (counts.get(couponId) ?? 0) - 1));
        return Promise.resolve(1);
      }
      return Promise.resolve(0);
    },
  };

  return {
    client: client as unknown as Prisma.TransactionClient,
    hasPair: (couponId: string, userId: string) => redemptions.has(pair(couponId, userId)),
    countFor: (couponId: string) => counts.get(couponId) ?? 0,
  };
}

describe("coupon reservation", () => {
  it("holds the unique pair without consuming a redemption slot", async () => {
    const { client, hasPair, countFor } = fakeCouponTx();
    await reserveCoupon(client, { couponId: "c1", userId: "u1", orderId: "o1" });
    expect(hasPair("c1", "u1")).toBe(true);
    expect(countFor("c1")).toBe(0);
  });

  it("claims the slot on commit, then reject of an uncommitted hold does not decrement", async () => {
    const { client, hasPair, countFor } = fakeCouponTx();
    await reserveCoupon(client, { couponId: "c1", userId: "u1", orderId: "o1" });
    await commitCouponReservation(client, "o1");
    expect(countFor("c1")).toBe(1);

    const pending = fakeCouponTx();
    await reserveCoupon(pending.client, { couponId: "c1", userId: "u1", orderId: "o1" });
    await releaseCouponReservation(pending.client, "o1");
    expect(pending.hasPair("c1", "u1")).toBe(false);
    expect(pending.countFor("c1")).toBe(0);
  });

  it("releases the pair on reject so the learner can reuse the code", async () => {
    const { client, hasPair, countFor } = fakeCouponTx();
    await reserveCoupon(client, { couponId: "c1", userId: "u1", orderId: "o1" });
    await releaseCouponReservation(client, "o1");
    expect(hasPair("c1", "u1")).toBe(false);
    expect(countFor("c1")).toBe(0);
  });

  it("does not touch other orders when releasing", async () => {
    const { client, hasPair, countFor } = fakeCouponTx();
    await reserveCoupon(client, { couponId: "c1", userId: "u1", orderId: "o1" });
    await commitCouponReservation(client, "o1");
    await releaseCouponReservation(client, "o-other");
    expect(hasPair("c1", "u1")).toBe(true);
    expect(countFor("c1")).toBe(1);
  });

  it("blocks a second reservation for the same user while the first is held", async () => {
    const { client } = fakeCouponTx();
    await reserveCoupon(client, { couponId: "c1", userId: "u1", orderId: "o1" });
    await expect(
      reserveCoupon(client, { couponId: "c1", userId: "u1", orderId: "o2" }),
    ).rejects.toThrow(/Unique/);
  });
});
