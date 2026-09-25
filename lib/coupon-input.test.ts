import { describe, expect, it } from "vitest";
import { describeCouponValue, parseCouponValue } from "./coupon-input";

describe("parseCouponValue", () => {
  it("takes a whole percentage from 1 to 100", () => {
    expect(parseCouponValue("PERCENTAGE", " 20 ")).toEqual({ ok: true, value: 20 });
    expect(parseCouponValue("PERCENTAGE", "100")).toEqual({ ok: true, value: 100 });
    expect(parseCouponValue("PERCENTAGE", "0").ok).toBe(false);
    expect(parseCouponValue("PERCENTAGE", "101").ok).toBe(false);
    expect(parseCouponValue("PERCENTAGE", "12.5").ok).toBe(false);
    expect(parseCouponValue("PERCENTAGE", "").ok).toBe(false);
  });

  it("turns an amount into minor units without floating point", () => {
    expect(parseCouponValue("FIXED", "500")).toEqual({ ok: true, value: 50000 });
    expect(parseCouponValue("FIXED", "4.99")).toEqual({ ok: true, value: 499 });
    expect(parseCouponValue("FIXED", "0.5")).toEqual({ ok: true, value: 50 });
  });

  it("refuses zero, negatives, three decimals and words", () => {
    expect(parseCouponValue("FIXED", "0").ok).toBe(false);
    expect(parseCouponValue("FIXED", "-5").ok).toBe(false);
    expect(parseCouponValue("FIXED", "1.999").ok).toBe(false);
    expect(parseCouponValue("FIXED", "five").ok).toBe(false);
  });
});

describe("describeCouponValue", () => {
  it("reads as a discount", () => {
    expect(describeCouponValue("PERCENTAGE", 20)).toBe("20% off");
    expect(describeCouponValue("FIXED", 50000)).toBe("500 off");
    expect(describeCouponValue("FIXED", 499)).toBe("4.99 off");
    expect(describeCouponValue("FIXED", 150000)).toBe("1,500 off");
  });
});
