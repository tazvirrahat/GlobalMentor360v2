import { describe, expect, it } from "vitest";
import { formatPrice, isFreeCourse, selectDisplayPrice } from "./courses";

const usd = { amount: 4900, currency: "USD" };
const bdt = { amount: 599000, currency: "BDT" };

describe("formatPrice", () => {
  it("formats USD minor units as dollars", () => {
    expect(formatPrice(4900, "USD")).toMatch(/\$49\.00/);
  });

  it("formats BDT minor units as taka", () => {
    // 599000 poisha = ৳5,990.00 — exact symbol varies by ICU data, so check the digits.
    expect(formatPrice(599000, "BDT")).toMatch(/5,?990/);
  });

  it("formats a free price as zero", () => {
    expect(formatPrice(0, "USD")).toMatch(/\$0\.00/);
  });
});

describe("selectDisplayPrice", () => {
  it("prefers the automatic rail's currency when a course is sold on both", () => {
    expect(selectDisplayPrice([bdt, usd])).toBe(usd);
  });

  it("gives the same answer whatever order the rows arrive in", () => {
    expect(selectDisplayPrice([usd, bdt])).toEqual(selectDisplayPrice([bdt, usd]));
  });

  it("falls back to the only rail a course is actually sold on", () => {
    expect(selectDisplayPrice([bdt])).toBe(bdt);
  });

  it("is deterministic for currencies no rail sells in", () => {
    const eur = { amount: 4500, currency: "EUR" };
    const gbp = { amount: 3900, currency: "GBP" };
    expect(selectDisplayPrice([gbp, eur])).toBe(eur);
    expect(selectDisplayPrice([eur, gbp])).toBe(eur);
  });

  it("returns null when there is no active price", () => {
    expect(selectDisplayPrice([])).toBeNull();
  });
});

describe("isFreeCourse", () => {
  it("treats a course priced 0 on every rail as free", () => {
    expect(isFreeCourse([{ amount: 0 }, { amount: 0 }])).toBe(true);
  });

  it("refuses a course that still charges on one rail", () => {
    // The case that rendered "Free" with a button that silently did nothing:
    // USD 49 for Stripe, BDT 0 for bKash.
    expect(isFreeCourse([usd, { amount: 0, currency: "BDT" }])).toBe(false);
  });

  it("does not give away a course that has no active price", () => {
    expect(isFreeCourse([])).toBe(false);
  });
});
