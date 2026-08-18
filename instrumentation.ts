/**
 * Runs once per server start (Next.js instrumentation convention).
 *
 * Readiness warnings live here so a misconfigured production deploy announces
 * itself in the boot log instead of failing silently at the first sign-up.
 */
export async function register() {
  // Node-only: the check reads server env and lib/email pulls the SES SDK,
  // neither of which belongs in the edge bundle.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { emailReadinessWarning } = await import("@/lib/email");
  const warning = emailReadinessWarning();
  if (warning) {
    console.warn(`[readiness] ${warning}`);
  }
}
