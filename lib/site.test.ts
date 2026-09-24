import { afterEach, describe, expect, it, vi } from "vitest";
import { getSite, siteToday, siteUrl } from "./site";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getSite", () => {
  it("names the academy and describes it like a course storefront", () => {
    const site = getSite();
    expect(site.name).toBe("GlobalMentor360");
    expect(site.title).toMatch(/online courses/i);
    expect(site.description.length).toBeLessThanOrEqual(160);
    // No product internals or tenancy wording in public copy.
    for (const copy of [site.title, site.description, site.headline, site.lede]) {
      expect(copy).not.toMatch(/quiz-gated|one academy|single-organi[sz]ation|serial/i);
    }
  });

  it("takes its origin from BETTER_AUTH_URL, without a trailing slash", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://learn.example.com/");
    expect(getSite().url).toBe("https://learn.example.com");
  });

  it("falls back to NEXT_PUBLIC_APP_URL, then localhost", () => {
    vi.stubEnv("BETTER_AUTH_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3100");
    expect(getSite().url).toBe("http://localhost:3100");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(getSite().url).toBe("http://localhost:3000");
  });
});

describe("siteUrl", () => {
  it("joins paths onto the origin", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://learn.example.com");
    expect(siteUrl("/courses")).toBe("https://learn.example.com/courses");
    expect(siteUrl("orders/1")).toBe("https://learn.example.com/orders/1");
  });
});

describe("siteToday", () => {
  it("is the date in Dhaka, not UTC", () => {
    // 20:30 UTC on 1 Aug is already 2 Aug in Dhaka (UTC+6).
    expect(siteToday(new Date("2026-08-01T20:30:00Z"))).toBe("2026-08-02");
    expect(siteToday(new Date("2026-08-01T10:00:00Z"))).toBe("2026-08-01");
  });
});
