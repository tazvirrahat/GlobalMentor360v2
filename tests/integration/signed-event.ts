import Stripe from "stripe";

/**
 * A genuinely signed `checkout.session.*` payload, built locally.
 *
 * Both generateTestHeaderString and constructEvent are HMAC over the request
 * bytes, so this needs no Stripe account, no API key, and no network — which is
 * what makes the webhook suite runnable in CI. The secret matches the one
 * tests/integration/setup.ts pins into the environment; if the two ever drift,
 * confirm() returns null and every webhook test passes without testing anything.
 */
export const WEBHOOK_SECRET = "whsec_integration_suite_secret";

const signer = new Stripe("sk_test_integration_suite_key");

export function signedEvent(options: {
  eventId: string;
  sessionId: string;
  paymentIntentId: string | null;
  paymentStatus: string;
  metadata: Record<string, string>;
  type?: string;
}) {
  const payload = JSON.stringify({
    id: options.eventId,
    object: "event",
    type: options.type ?? "checkout.session.completed",
    data: {
      object: {
        id: options.sessionId,
        object: "checkout.session",
        payment_status: options.paymentStatus,
        payment_intent: options.paymentIntentId,
        metadata: options.metadata,
      },
    },
  });

  return {
    rawBody: payload,
    headers: {
      "stripe-signature": signer.webhooks.generateTestHeaderString({
        payload,
        secret: WEBHOOK_SECRET,
      }),
    },
  };
}
