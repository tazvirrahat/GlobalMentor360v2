import { describe, expect, it } from "vitest";
import { decodeViewAs, encodeViewAs, viewAsExpiry } from "./view-as-cookie";

const SECRET = "test-secret-with-enough-length";
const grant = { adminId: "admin-1", targetId: "learner-1", expiresAt: 2_000_000_000_000 };

describe("view-as cookie", () => {
  it("round-trips a grant", () => {
    const raw = encodeViewAs(grant, SECRET);
    expect(decodeViewAs(raw, SECRET, 1_000)).toEqual(grant);
    expect(viewAsExpiry(raw)).toBe(grant.expiresAt);
  });

  it("refuses a changed payload, another secret, or garbage", () => {
    const raw = encodeViewAs(grant, SECRET);
    const [, sig] = raw.split(".");
    const forged = `${Buffer.from(JSON.stringify({ a: "admin-1", t: "someone-else", e: grant.expiresAt })).toString("base64url")}.${sig}`;
    expect(decodeViewAs(forged, SECRET, 1_000)).toBeNull();
    expect(decodeViewAs(raw, "another-secret", 1_000)).toBeNull();
    expect(decodeViewAs("nonsense", SECRET, 1_000)).toBeNull();
    expect(decodeViewAs(undefined, SECRET, 1_000)).toBeNull();
    expect(viewAsExpiry("nonsense")).toBeNull();
  });

  it("expires", () => {
    const raw = encodeViewAs(grant, SECRET);
    expect(decodeViewAs(raw, SECRET, grant.expiresAt)).toBeNull();
  });
});
