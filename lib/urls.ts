/**
 * Pure URL helpers. No Next or Prisma imports — safe to use from server components,
 * client components, and plain test scripts alike.
 */

/**
 * Only same-origin paths survive.
 *
 * Without this, a crafted `?next=https://evil.example` would turn our own sign-in
 * page into an open redirect: the victim sees a legitimate domain, signs in, and
 * is bounced to an attacker's clone.
 *
 * Rejected:
 *   - anything not starting with "/"          (absolute URLs, `javascript:`)
 *   - "//host"                                (protocol-relative — browsers treat as absolute)
 *   - "/\host" and "/\\host"                  (backslashes normalise to "/" in some browsers)
 */
export function safeReturnPath(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  if (!candidate.startsWith("/")) return null;
  if (candidate.startsWith("//")) return null;
  if (candidate.startsWith("/\\")) return null;
  return candidate;
}
