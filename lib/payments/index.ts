import { bkashManualRail } from "./bkash-manual";
import type { PaymentRail } from "./rail";

/**
 * Registered rails, in the order they should appear at checkout.
 *
 * To add bKash PGW later: implement an AutomaticRail, put it ahead of the manual
 * one here, and have its `isConfigured()` return false when credentials are
 * absent. Checkout renders whichever rails are configured, so the manual rail
 * becomes the automatic fallback without any conditional logic in the pages.
 *
 * Stripe lands here the same way.
 */
const RAILS: PaymentRail[] = [bkashManualRail];

export function availableRails(): PaymentRail[] {
  return RAILS.filter((rail) => rail.isConfigured());
}

export function getRail(id: string): PaymentRail | null {
  return RAILS.find((rail) => rail.id === id && rail.isConfigured()) ?? null;
}

export { bkashManualRail, BKASH_CURRENCY } from "./bkash-manual";
export * from "./rail";
export * from "./validation";
