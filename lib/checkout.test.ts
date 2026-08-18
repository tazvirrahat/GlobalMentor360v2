import { describe, expect, it } from "vitest";
import {
  applyCouponQueryResult,
  bkashAmountDue,
  quotedBkashCouponCode,
  type CheckoutQuote,
} from "./checkout";

function okQuote(overrides: Partial<Extract<CheckoutQuote, { ok: true }>> = {}): Extract<CheckoutQuote, { ok: true }> {
  return {
    ok: true,
    currency: "BDT",
    lines: [{ courseId: "a", title: "A", slug: "a", unitPrice: 100000, discountApplied: 10000 }],
    subtotal: 100000,
    discount: 10000,
    total: 90000,
    coupon: {
      id: "c1",
      code: "SAVE10",
      type: "PERCENTAGE",
      value: 10,
      courseId: null,
      maxRedemptions: null,
      redeemedCount: 0,
      validFrom: null,
      validUntil: null,
      isActive: true,
    },
    ...overrides,
  };
}

describe("bkashAmountDue", () => {
  it("is the quoted total after coupon, not the undiscounted subtotal", () => {
    const quote = okQuote();
    expect(bkashAmountDue(quote)).toBe(90000);
    expect(bkashAmountDue(quote)).not.toBe(quote.subtotal);
  });

  it("is not a line's list unitPrice — that is what single-course checkout used to print", () => {
    const quote = okQuote();
    expect(quote.lines[0]?.unitPrice).toBe(100000);
    expect(bkashAmountDue(quote)).toBe(90000);
  });

  it("is the full subtotal when no coupon applied", () => {
    const quote = okQuote({
      discount: 0,
      total: 100000,
      coupon: null,
      lines: [{ courseId: "a", title: "A", slug: "a", unitPrice: 100000, discountApplied: 0 }],
    });
    expect(bkashAmountDue(quote)).toBe(quote.subtotal);
  });
});

describe("quotedBkashCouponCode", () => {
  it("is the coupon the quote applied, so a ?coupon= apply matches what submit stores", () => {
    expect(quotedBkashCouponCode(okQuote())).toBe("SAVE10");
  });

  it("is empty when the quote has no coupon, even if the URL still has a rejected code", () => {
    expect(quotedBkashCouponCode(okQuote({ coupon: null, discount: 0, total: 100000 }))).toBe("");
  });
});

describe("applyCouponQueryResult", () => {
  it("retries without the code when ?coupon= is rejected, and keeps the message", () => {
    const quoted = { ok: false as const, message: "That coupon is not valid." };
    expect(applyCouponQueryResult(quoted, "NOPE")).toEqual({
      couponMessage: "That coupon is not valid.",
      retryWithoutCoupon: true,
    });
  });

  it("does not retry when pricing failed for a reason other than a coupon", () => {
    const quoted = { ok: false as const, message: "Your cart is empty." };
    expect(applyCouponQueryResult(quoted, undefined)).toEqual({
      couponMessage: null,
      retryWithoutCoupon: false,
    });
  });
});
