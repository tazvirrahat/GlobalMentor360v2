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
      <p className="mt-2 text-xs text-muted-foreground">
        Local development: if nothing arrives, the link is printed in the server
        terminal. SES sandbox cannot mail arbitrary addresses.
      </p>
    );
  }

  return (
    <p className="mt-2 text-xs text-muted-foreground">
      If it doesn&rsquo;t arrive, check spam. Until email sending is fully enabled,
      some addresses will not receive mail — contact the academy if you need the
      link.
    </p>
  );
}
