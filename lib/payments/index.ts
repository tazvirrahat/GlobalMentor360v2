import { bkashManualRail } from "./bkash-manual";
import { stripeRail } from "./stripe";
import type { PaymentRail } from "./rail";

/**
 * Registered rails, in the order they should appear at checkout.
 *
 * Automatic rails come before manual ones: instant access is the better offer,
 * so it renders first. Stripe hides itself via `isConfigured()` when credentials
 * are absent, and the manual bKash rail becomes the fallback without any
 * conditional logic in the pages.
 *
 * To add bKash PGW later: implement an AutomaticRail and slot it in the same way.
 */
const RAILS: PaymentRail[] = [stripeRail, bkashManualRail];

export function availableRails(): PaymentRail[] {
  return RAILS.filter((rail) => rail.isConfigured());
}

export function getRail(id: string): PaymentRail | null {
  return RAILS.find((rail) => rail.id === id && rail.isConfigured()) ?? null;
}

/**
 * Why a priced course cannot currently be bought, or null when it can.
 *
 * A paid course is sellable when some configured rail has a price in its
 * currency: bKash needs a positive BDT price (the rail is always configured),
 * Stripe needs a positive USD price *and* credentials. A course that fails both
 * renders a checkout with no payment methods — the catalog shows a price nobody
 * can pay. Studio settings and the admin course list surface this so the gap is
 * caught at publish time, not by a learner.
 *
 * Courses with no active price at all are the readiness checklist's job
 * ("Has a price"), and all-zero prices mean free enrolment — neither warns here.
 */
export function courseSellabilityWarning(
  prices: readonly { currency: string; amount: number }[],
): string | null {
  if (prices.length === 0) return null;
  if (prices.every((price) => price.amount === 0)) return null;

  const bkashSellable = prices.some(
    (price) => price.currency === bkashManualRail.currency && price.amount > 0,
  );
  if (bkashSellable) return null;

  const stripeSellable =
    stripeRail.isConfigured() &&
    prices.some((price) => price.currency === stripeRail.currency && price.amount > 0);
  if (stripeSellable) return null;

  return stripeRail.isConfigured()
    ? "This course has no BDT price and no USD price, so no payment method can sell it. Set a price learners can pay in."
    : "This course has no BDT (bKash) price, and card payments are not configured — learners have no way to buy it. Set a BDT price.";
}

export {
  bkashManualRail,
  BKASH_CURRENCY,
  DuplicateBkashTransactionError,
  getBkashMerchantNumber,
  isBkashTransactionConflict,
} from "./bkash-manual";
export { assertNoInFlightPayment, InFlightPaymentError } from "./in-flight";
export {
  approveManualPayment,
  listPendingManualPayments,
  MANUAL_PAYMENT_QUEUE_PAGE_SIZE,
  rejectManualPayment,
} from "./manual-review";
export { stripeRail, STRIPE_CURRENCY } from "./stripe";
export * from "./rail";
export * from "./validation";
