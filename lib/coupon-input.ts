import { toMinorUnits } from "@/lib/money-input";

export type CouponType = "PERCENTAGE" | "FIXED";

/**
 * The coupon form's value field. "Percent off" is a whole number from 1 to 100;
 * "Amount off" is typed the way a price is (৳500, 4.99) and stored in minor
 * units, like every other amount — so an instructor never has to type 50000
 * to mean ৳500.
 */
export function parseCouponValue(
  type: CouponType,
  raw: string,
): { ok: true; value: number } | { ok: false; message: string } {
  const text = raw.trim();
  if (type === "PERCENTAGE") {
    if (!/^\d+$/.test(text)) return { ok: false, message: "Enter a whole percentage, like 20." };
    const value = Number(text);
    if (value < 1 || value > 100) return { ok: false, message: "A percentage has to be between 1 and 100." };
    return { ok: true, value };
  }
  const value = toMinorUnits(text);
  if (value === null || value < 1) {
    return { ok: false, message: "Enter an amount above 0, with at most 2 decimal places." };
  }
  return { ok: true, value };
}

/** How a coupon's discount reads in a list: "20% off", "500 off", "4.99 off". */
export function describeCouponValue(type: string, value: number): string {
  if (type === "PERCENTAGE") return `${value}% off`;
  const whole = value % 100 === 0;
  const amount = new Intl.NumberFormat("en", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
  return `${amount} off`;
}
