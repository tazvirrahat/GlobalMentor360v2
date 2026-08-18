import { stripeRail } from "@/lib/payments";

/**
 * Stripe webhook receiver.
 *
 * This is the only place a Stripe payment becomes real. The browser's success
 * redirect proves nothing; the signed event verified inside stripeRail.confirm
 * is what marks the payment COMPLETED and grants enrollment (invariant 5).
 *
 * App Router route handlers hand us the raw request body via req.text() — no
 * body-parser configuration is needed, and none must be added: the signature is
 * computed over the exact bytes Stripe sent.
 */
export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const result = await stripeRail.confirm({ rawBody, headers });

  // Null means the signature did not verify — this request is not from Stripe.
  if (!result) {
    return new Response("Invalid signature", { status: 401 });
  }

  // Missing rows and amount mismatches must not ACK: Stripe retries until the
  // row exists or an operator sees the failing delivery. COMPLETED duplicates
  // and REFUNDED replays are terminal — ACK those so retries stop.
  if (result.retry) {
    return new Response("Stripe fulfill skipped", { status: 500 });
  }

  return Response.json({ received: true, paid: result.paid });
}
