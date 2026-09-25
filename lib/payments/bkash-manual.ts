import { reserveCoupon } from "@/lib/coupons";
import { db } from "@/lib/db";
import { assertNoInFlightPayment } from "./in-flight";
import type { BeginManualInput, ManualRail } from "./rail";

export const BKASH_CURRENCY = "BDT";

export class DuplicateBkashTransactionError extends Error {
  constructor() {
    super("This transaction ID has already been submitted");
    this.name = "DuplicateBkashTransactionError";
  }
}

/**
 * Whether a thrown value is the partial unique index on bKash transaction IDs
 * (PENDING_VERIFICATION / COMPLETED). Other unique violations — coupon
 * (couponId, userId), order.providerRef — must not be mapped to this copy.
 */
export function isBkashTransactionConflict(error: unknown): boolean {
  const seen = new Set<unknown>();

  const visit = (value: unknown): boolean => {
    if (!value || typeof value !== "object" || seen.has(value)) return false;
    seen.add(value);
    const record = value as Record<string, unknown>;
    const blob = [
      record.code,
      record.constraint,
      record.message,
      typeof record.meta === "object" ? JSON.stringify(record.meta) : "",
    ].join(" ");

    const namesIndex =
      blob.includes("payments_bkash_transaction_id_active_key") || blob.includes("bkashTransactionId");
    if (namesIndex) {
      const code = String(record.code ?? "");
      if (code === "P2002" || code === "23505") return true;
    }

    return visit(record.cause) || visit(record.meta);
  };

  return visit(error);
}

/**
 * The bKash number learners send money to, or null when it has not been
 * configured. Checkout copy branches on this: with a number it says where to
 * send, without one it says the number isn't on the page and to ask support —
 * never "send to our bKash number" as if the page had shown it.
 *
 * Deliberately not part of isConfigured(): the manual rail predates this env var
 * and works without it (the number can be communicated out of band), so an empty
 * value must not hide the rail.
 */
export function getBkashMerchantNumber(): string | null {
  const value = process.env.BKASH_MERCHANT_NUMBER?.trim();
  return value ? value : null;
}

/**
 * bKash by manual transfer.
 *
 * The learner pays in the bKash app on their own, then types the transaction ID
 * here. Nothing in this file contacts bKash — there is no API call and no
 * automatic confirmation. An admin checks the transaction in their own bKash
 * portal and approves it, which is the only thing that grants access.
 *
 * This is the rail to use without merchant API credentials. It trades instant
 * access for zero integration: every purchase costs a human a minute.
 */
export const bkashManualRail: ManualRail = {
  id: "bkash-manual",
  method: "BKASH",
  kind: "manual",
  currency: BKASH_CURRENCY,
  label: "bKash (manual transfer)",

  // No credentials to check — this rail works with nothing configured, which is
  // the entire reason it exists.
  isConfigured() {
    return true;
  },

  async submitProof(input: BeginManualInput): Promise<{ paymentId: string }> {
    const lines =
      input.items && input.items.length > 0
        ? input.items
        : input.courseId
          ? [{ courseId: input.courseId, unitPrice: input.amount, discountApplied: 0 }]
          : [];

    if (lines.length === 0) {
      throw new Error("bKash checkout was called with no courses.");
    }

    const discount = input.discount ?? 0;
    const subtotal = lines.reduce((sum, line) => sum + line.unitPrice, 0);

    try {
      const paymentId = await db.$transaction(async (tx) => {
        await assertNoInFlightPayment(
          tx,
          input.userId,
          lines.map((line) => line.courseId),
        );

        const order = await tx.order.create({
          data: {
            userId: input.userId,
            status: "PENDING",
            currency: BKASH_CURRENCY,
            subtotal,
            discount,
            total: input.amount,
            items: {
              create: lines.map((line) => ({
                courseId: line.courseId,
                unitPrice: line.unitPrice,
                discountApplied: line.discountApplied ?? 0,
              })),
            },
          },
        });

        if (input.couponId) {
          // Reservation marker only — unique (couponId, userId) blocks double-use.
          // redeemedCount is claimed at admin approval (or immediately on a
          // zero-total fulfill), so a fake pending proof cannot park the cap.
          await reserveCoupon(tx, {
            couponId: input.couponId,
            userId: input.userId,
            orderId: order.id,
          });
        }

        const payment = await tx.payment.create({
          data: {
            orderId: order.id,
            userId: input.userId,
            method: "BKASH",
            // Deliberately not COMPLETED. The DB constraint would reject it
            // anyway without a verifier, which is the point.
            status: "PENDING_VERIFICATION",
            amount: input.amount,
            currency: BKASH_CURRENCY,
            bkashTransactionId: input.proof.transactionId,
            bkashPhoneNumber: input.proof.phoneNumber,
            bkashPaymentDate: input.proof.paymentDate
              ? new Date(input.proof.paymentDate)
              : null,
            bkashReference: input.proof.reference || null,
          },
        });

        return payment.id;
      });

      return { paymentId };
    } catch (error) {
      if (error instanceof DuplicateBkashTransactionError) throw error;
      if (isBkashTransactionConflict(error)) {
        throw new DuplicateBkashTransactionError();
      }
      throw error;
    }
  },
};
