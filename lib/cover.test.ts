import { describe, expect, it } from "vitest";
import { COVER_TINTS, coverInitial, coverTint } from "./cover";
import { contrastRatio, PALETTE } from "./design-tokens";

describe("coverTint", () => {
  it("is stable for a key and always from the set", () => {
    expect(coverTint("data-science")).toBe(coverTint("data-science"));
    for (const key of ["a", "web-development", "management", "", "x".repeat(200)]) {
      expect(COVER_TINTS).toContain(coverTint(key));
    }
  });

  it("spreads the seed courses over several tints", () => {
    // Keyed by course slug: six categories hashed into six tints put five of the
    // six seed courses on the same colour.
    const slugs = [
      "typescript-foundations",
      "sql-for-analysts",
      "postgres-for-app-developers",
      "excel-for-business-reporting",
      "spoken-english-for-interviews",
      "python-basics",
    ];
    expect(new Set(slugs.map((slug) => coverTint(slug).bg)).size).toBeGreaterThanOrEqual(5);
  });

  it("keeps ink initials readable on every tint", () => {
    for (const tint of COVER_TINTS) {
      expect(contrastRatio(PALETTE.ink, tint.bg), tint.name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("never reuses a colour that already means something", () => {
    const reserved = [PALETTE.mark, PALETTE.cautionWash, PALETTE.verified, PALETTE.seal].map((c) => c.toLowerCase());
    for (const tint of COVER_TINTS) expect(reserved).not.toContain(tint.bg.toLowerCase());
  });
});

describe("coverInitial", () => {
  it("takes the first letter or digit", () => {
    expect(coverInitial("  python basics")).toBe("P");
    expect(coverInitial("3D modelling")).toBe("3");
    expect(coverInitial("“Quoted” title")).toBe("Q");
    expect(coverInitial("")).toBe("?");
  });
});
