import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The admin "view as" grant (features plan 16): which admin is looking, as
 * whom, until when, signed so it cannot be altered. It grants nothing by
 * itself; lib/impersonation checks it against the database on every request.
 */

export const VIEW_AS_COOKIE = "gm360_view_as";
/** Display-only companion the banner reads (name and end time). No authority. */
export { VIEW_AS_LABEL_COOKIE } from "@/lib/view-as-cookie-name";
export const VIEW_AS_MINUTES = 30;

export type ViewAsGrant = { adminId: string; targetId: string; expiresAt: number };

const b64 = (value: string | Buffer) => Buffer.from(value).toString("base64url");

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function encodeViewAs(grant: ViewAsGrant, secret: string): string {
  const payload = b64(JSON.stringify({ a: grant.adminId, t: grant.targetId, e: grant.expiresAt }));
  return `${payload}.${signature(payload, secret)}`;
}

/** The grant when the signature matches and it has not expired; null otherwise. */
export function decodeViewAs(raw: string | undefined, secret: string, now: number = Date.now()): ViewAsGrant | null {
  if (!raw || !secret) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(signature(payload, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { a?: unknown; t?: unknown; e?: unknown };
    if (typeof data.a !== "string" || typeof data.t !== "string" || typeof data.e !== "number") return null;
    if (data.e <= now) return null;
    return { adminId: data.a, targetId: data.t, expiresAt: data.e };
  } catch {
    return null;
  }
}

/**
 * When a grant ends, read without checking the signature. Only the proxy uses
 * it, to decide whether to block writes: a forged cookie can only make its own
 * holder read-only, so there is nothing to gain by faking one.
 */
export function viewAsExpiry(raw: string | undefined): number | null {
  const payload = raw?.split(".")[0];
  if (!payload) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { e?: unknown };
    return typeof data.e === "number" ? data.e : null;
  } catch {
    return null;
  }
}
