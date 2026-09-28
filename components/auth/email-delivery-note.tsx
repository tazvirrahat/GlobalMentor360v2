"use client";

/**
 * Honest follow-up under every "we sent a link" surface.
 *
 * Production SES is still in the sandbox (verified recipients only). Copy that
 * only says "check your inbox" strands people whose address SES will never
 * accept. Locally, when EMAIL_FROM is empty, the link is in the server terminal.
 */
export function EmailDeliveryNote() {
  if (process.env.NODE_ENV === "development") {
    return (
      <p className="mt-2 text-sm text-graphite">
        Local development: if nothing arrives, the link is printed in the server
        terminal. SES sandbox cannot mail arbitrary addresses.
      </p>
    );
  }

  return (
    <p className="mt-2 text-sm text-graphite">
      If it doesn&rsquo;t arrive, check your spam folder. Some addresses can&rsquo;t receive our email yet;
      contact us if you need the link.
    </p>
  );
}
