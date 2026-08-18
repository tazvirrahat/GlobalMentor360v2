import { describe, expect, it } from "vitest";
import {
  availableRails,
  bkashCheckoutIdentitySchema,
  bkashManualRail,
  bkashSubmissionSchema,
  courseSellabilityWarning,
  DuplicateBkashTransactionError,
  getBkashMerchantNumber,
  InFlightPaymentError,
  isBkashTransactionConflict,
  stripeRail,
} from "./index";

describe("bkashSubmissionSchema", () => {
  const valid = {
    courseId: "course-1",
    transactionId: "TXN12345",
    phoneNumber: "01712345678",
    paymentDate: "2026-01-15",
    reference: "",
  };

  it("accepts a well-formed submission", () => {
    expect(bkashSubmissionSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a coupon-only identity without transfer details", () => {
    expect(
      bkashCheckoutIdentitySchema.safeParse({ courseId: "course-1", couponCode: "SAVE10" }).success,
    ).toBe(true);
  });

  it("rejects short transaction ids", () => {
    const result = bkashSubmissionSchema.safeParse({ ...valid, transactionId: "ab" });
    expect(result.success).toBe(false);
  });

  it("rejects non-Bangladeshi phone numbers", () => {
    const result = bkashSubmissionSchema.safeParse({ ...valid, phoneNumber: "12345" });
    expect(result.success).toBe(false);
  });

  it("rejects a payment dated far in the future", () => {
    const result = bkashSubmissionSchema.safeParse({
      ...valid,
      paymentDate: "2099-01-01",
    });
    expect(result.success).toBe(false);
  });
});

describe("payment rails", () => {
  it("exposes stripe as automatic and bkash as manual", () => {
    expect(stripeRail.kind).toBe("automatic");
    expect(stripeRail.method).toBe("STRIPE");
    expect(stripeRail.currency).toBe("USD");
    expect(bkashManualRail.kind).toBe("manual");
    expect(bkashManualRail.method).toBe("BKASH");
    expect(bkashManualRail.currency).toBe("BDT");
  });

  it("hides stripe when credentials are absent", () => {
    const previousSecret = process.env.STRIPE_SECRET_KEY;
    const previousWebhook = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;

    expect(stripeRail.isConfigured()).toBe(false);
    expect(availableRails().every((rail) => rail.id !== "stripe")).toBe(true);

    if (previousSecret !== undefined) process.env.STRIPE_SECRET_KEY = previousSecret;
    if (previousWebhook !== undefined) process.env.STRIPE_WEBHOOK_SECRET = previousWebhook;
  });

  it("always exposes the manual bKash rail (no credentials required)", () => {
    expect(bkashManualRail.isConfigured()).toBe(true);
    expect(availableRails().some((rail) => rail.id === "bkash-manual")).toBe(true);
  });
});

describe("getBkashMerchantNumber", () => {
  const restore = (value: string | undefined) => {
    if (value === undefined) delete process.env.BKASH_MERCHANT_NUMBER;
    else process.env.BKASH_MERCHANT_NUMBER = value;
  };

  it("returns null when unset or blank — checkout must not invent a number", () => {
    const previous = process.env.BKASH_MERCHANT_NUMBER;
    delete process.env.BKASH_MERCHANT_NUMBER;
    expect(getBkashMerchantNumber()).toBeNull();
    process.env.BKASH_MERCHANT_NUMBER = "   ";
    expect(getBkashMerchantNumber()).toBeNull();
    restore(previous);
  });

  it("returns the trimmed number when configured", () => {
    const previous = process.env.BKASH_MERCHANT_NUMBER;
    process.env.BKASH_MERCHANT_NUMBER = " 01700000000 ";
    expect(getBkashMerchantNumber()).toBe("01700000000");
    restore(previous);
  });
});

describe("courseSellabilityWarning", () => {
  const withoutStripe = (run: () => void) => {
    const previousSecret = process.env.STRIPE_SECRET_KEY;
    const previousWebhook = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    try {
      run();
    } finally {
      if (previousSecret !== undefined) process.env.STRIPE_SECRET_KEY = previousSecret;
      if (previousWebhook !== undefined) process.env.STRIPE_WEBHOOK_SECRET = previousWebhook;
    }
  };

  const withStripe = (run: () => void) => {
    const previousSecret = process.env.STRIPE_SECRET_KEY;
    const previousWebhook = process.env.STRIPE_WEBHOOK_SECRET;
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_x";
    try {
      run();
    } finally {
      if (previousSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = previousSecret;
      if (previousWebhook === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
      else process.env.STRIPE_WEBHOOK_SECRET = previousWebhook;
    }
  };

  it("warns for a USD-only course when Stripe is unconfigured", () => {
    withoutStripe(() => {
      expect(courseSellabilityWarning([{ currency: "USD", amount: 4900 }])).toMatch(/no BDT/i);
    });
  });

  it("is quiet for a USD-only course when Stripe is configured", () => {
    withStripe(() => {
      expect(courseSellabilityWarning([{ currency: "USD", amount: 4900 }])).toBeNull();
    });
  });

  it("is quiet when a positive BDT price exists, with or without Stripe", () => {
    withoutStripe(() => {
      expect(
        courseSellabilityWarning([
          { currency: "USD", amount: 4900 },
          { currency: "BDT", amount: 599000 },
        ]),
      ).toBeNull();
    });
  });

  it("treats a zero BDT price alongside a paid USD price as unpayable", () => {
    // isFreeCourse refuses this shape (one rail still charges), so the learner
    // sees a price — and without Stripe there is no rail that can take it.
    withoutStripe(() => {
      expect(
        courseSellabilityWarning([
          { currency: "USD", amount: 4900 },
          { currency: "BDT", amount: 0 },
        ]),
      ).toMatch(/no way to buy/i);
    });
  });

  it("stays out of free courses and unpriced courses", () => {
    withoutStripe(() => {
      expect(courseSellabilityWarning([{ currency: "BDT", amount: 0 }])).toBeNull();
      expect(courseSellabilityWarning([])).toBeNull();
    });
  });
});

describe("DuplicateBkashTransactionError", () => {
  it("tells the learner the transaction ID was already submitted", () => {
    expect(new DuplicateBkashTransactionError().message).toBe(
      "This transaction ID has already been submitted",
    );
  });
});

describe("isBkashTransactionConflict", () => {
  it("recognises a Prisma unique violation on the bKash trx index", () => {
    expect(
      isBkashTransactionConflict({
        code: "P2002",
        meta: { target: ["bkashTransactionId"] },
      }),
    ).toBe(true);
    expect(
      isBkashTransactionConflict({
        code: "23505",
        constraint: "payments_bkash_transaction_id_active_key",
      }),
    ).toBe(true);
  });

  it("does not treat a coupon unique pair as a duplicate transaction ID", () => {
    expect(
      isBkashTransactionConflict({
        code: "P2002",
        meta: { target: ["couponId", "userId"] },
      }),
    ).toBe(false);
  });
});

describe("InFlightPaymentError", () => {
  it("uses singular copy for one course and plural for a cart", () => {
    expect(new InFlightPaymentError(1).message).toMatch(/this course/);
    expect(new InFlightPaymentError(2).message).toMatch(/one of these courses/);
  });
});
