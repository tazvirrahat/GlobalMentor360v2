import { describe, expect, it } from "vitest";
import { partitionCheckoutLines, type CartLine } from "./cart";

function line(overrides: Partial<CartLine> & Pick<CartLine, "courseId">): CartLine {
  return {
    title: overrides.courseId,
    slug: overrides.courseId,
    thumbnailUrl: null,
    addedAt: new Date(),
    prices: [],
    isFree: false,
    enrolled: false,
    ...overrides,
  };
}

describe("partitionCheckoutLines", () => {
  it("splits owned, free, payable and unpriced courses", () => {
    const result = partitionCheckoutLines([
      line({
        courseId: "owned",
        enrolled: true,
        prices: [{ amount: 1000, currency: "BDT" }],
      }),
      line({
        courseId: "free",
        isFree: true,
        prices: [
          { amount: 0, currency: "USD" },
          { amount: 0, currency: "BDT" },
        ],
      }),
      line({
        courseId: "paid",
        prices: [{ amount: 599000, currency: "BDT" }],
      }),
      line({
        courseId: "usd-only",
        prices: [{ amount: 4900, currency: "USD" }],
      }),
    ]);

    expect(result.owned.map((item) => item.courseId)).toEqual(["owned"]);
    expect(result.free.map((item) => item.courseId)).toEqual(["free"]);
    expect(result.payable).toEqual([
      {
        courseId: "paid",
        title: "paid",
        slug: "paid",
        unitPrice: 599000,
        currency: "BDT",
      },
    ]);
    expect(result.unpriced.map((item) => item.courseId)).toEqual(["usd-only"]);
  });

  it("does not treat a zero BDT price as free when another rail still charges", () => {
    // Same shape as isFreeCourse: USD 49 + BDT 0 is payable on a rail, so it
    // must not fall into the free bucket and grant access without payment.
    const result = partitionCheckoutLines([
      line({
        courseId: "mixed",
        isFree: false,
        prices: [
          { amount: 4900, currency: "USD" },
          { amount: 0, currency: "BDT" },
        ],
      }),
    ]);

    expect(result.free).toEqual([]);
    expect(result.payable).toEqual([]);
    expect(result.unpriced.map((item) => item.courseId)).toEqual(["mixed"]);
  });
});
