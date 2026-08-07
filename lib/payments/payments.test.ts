import { describe, expect, it } from "vitest";
import { availableRails, bkashManualRail, bkashSubmissionSchema, stripeRail } from "./index";

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
