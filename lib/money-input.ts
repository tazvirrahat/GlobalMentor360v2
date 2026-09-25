/**
 * Money typed into a form, turned into integer minor units (paisa, cents).
 * Shared by the course price and the coupon form so the two cannot drift.
 */

/** `amount` is a Postgres INTEGER — past this a "price" is a typo, not money. */
export const MAX_MINOR_UNITS = 2_147_483_647;

/**
 * Parses a decimal amount into integer minor units without a float in the path.
 *
 * `Math.round(Number(input) * 100)` lands on the right integer for the amounts a
 * form produces, but it gets there through binary floating point — 49.99 * 100
 * is 4998.999999999999. Splitting on the decimal point keeps money integral all
 * the way down, which is the rule everywhere else in commerce.
 *
 * Null for anything that is not a plain non-negative decimal with at most two
 * fraction digits — including the third digit that rounding used to swallow.
 */
export function toMinorUnits(input: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!match) return null;

  const minor = Number(match[1] ?? "0") * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return minor <= MAX_MINOR_UNITS ? minor : null;
}
