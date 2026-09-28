import { describe, expect, it } from "vitest";
import { parseProfileInput } from "./instructor-profile";

const base = { headline: "", bio: "", websiteUrl: "", profilePublic: true };

describe("parseProfileInput", () => {
  it("trims and turns empty fields into nulls", () => {
    expect(parseProfileInput({ ...base, headline: "  Data analyst  ", bio: " " })).toEqual({
      ok: true,
      value: { headline: "Data analyst", bio: null, websiteUrl: null, profilePublic: true },
    });
  });

  it("adds https:// to a bare domain and keeps http(s) links", () => {
    const bare = parseProfileInput({ ...base, websiteUrl: "example.com/me" });
    expect(bare.ok && bare.value.websiteUrl).toBe("https://example.com/me");
    const http = parseProfileInput({ ...base, websiteUrl: "http://example.org" });
    expect(http.ok && http.value.websiteUrl).toBe("http://example.org/");
  });

  it("refuses other schemes and junk", () => {
    expect(parseProfileInput({ ...base, websiteUrl: "javascript:alert(1)" })).toMatchObject({ ok: false, field: "websiteUrl" });
    expect(parseProfileInput({ ...base, websiteUrl: "ftp://files.example.com" })).toMatchObject({ ok: false });
    expect(parseProfileInput({ ...base, websiteUrl: "not a url at all" })).toMatchObject({ ok: false });
  });

  it("caps headline and bio", () => {
    expect(parseProfileInput({ ...base, headline: "x".repeat(61) })).toMatchObject({ ok: false, field: "headline" });
    expect(parseProfileInput({ ...base, bio: "x".repeat(2001) })).toMatchObject({ ok: false, field: "bio" });
  });
});
