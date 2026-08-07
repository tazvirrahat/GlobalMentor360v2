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

export { bkashManualRail, BKASH_CURRENCY } from "./bkash-manual";
export { stripeRail, STRIPE_CURRENCY } from "./stripe";
export * from "./rail";
export * from "./validation";
