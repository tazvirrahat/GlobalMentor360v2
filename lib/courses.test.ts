import { describe, expect, it } from "vitest";
import { formatPrice } from "./courses";

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
