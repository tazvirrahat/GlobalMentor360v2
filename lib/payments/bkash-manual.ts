import { db } from "@/lib/db";
import type { BeginManualInput, ManualRail } from "./rail";

export const BKASH_CURRENCY = "BDT";

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
    const paymentId = await db.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          userId: input.userId,
          status: "PENDING",
          currency: BKASH_CURRENCY,
          subtotal: input.amount,
          total: input.amount,
          items: { create: { courseId: input.courseId, unitPrice: input.amount } },
        },
      });

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
  },
};
