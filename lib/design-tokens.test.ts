import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PALETTE, REQUIRED_PAIRS, contrastRatio } from "./design-tokens";

const hex = (name: string) => (name === "white" ? "#ffffff" : PALETTE[name as keyof typeof PALETTE]);

describe("contrastRatio", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#1d2242", "#fcfcfd")).toBeCloseTo(contrastRatio("#fcfcfd", "#1d2242"), 10);
  });
});

describe("palette pairs", () => {
  for (const pair of REQUIRED_PAIRS) {
    it(`${pair.fg} on ${pair.bg} ≥ ${pair.min}:1 (${pair.use})`, () => {
      expect(contrastRatio(hex(pair.fg), hex(pair.bg))).toBeGreaterThanOrEqual(pair.min);
    });
  }
});

describe("globals.css", () => {
  const css = readFileSync(path.resolve("app/globals.css"), "utf8").toLowerCase();

  it("declares every palette value", () => {
    for (const [name, value] of Object.entries(PALETTE)) {
      expect(css, name).toContain(value.toLowerCase());
    }
  });

  it("has no trace of the old teal/amber system", () => {
    for (const old of ["#0e4f56", "#c2410c", "#f7fafa", "fraunces", "source-sans", "noto-bengali"]) {
      expect(css).not.toContain(old);
    }
  });
});
