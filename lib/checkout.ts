import { isFreeCourse } from "@/lib/courses";
import { grantEnrollment } from "@/lib/enrollment";
import {
  applyCouponToItems,
  commitCouponReservation,
  couponAppliesToCart,
  hasRedeemedCoupon,
  lookupCoupon,
  reserveCoupon,
  type CouponRecord,
  type DiscountBreakdown,
} from "@/lib/coupons";
import { db } from "@/lib/db";
import { isEnrolled } from "@/lib/entitlement";
import { assertNoInFlightPayment, BKASH_CURRENCY } from "@/lib/payments";

/**
 * A checkout quote: DB prices, then an optional coupon. Nothing here grants
 * access. The amount that lands on Order / Payment is this total, never a
 * figure the browser posted.
 */

export type QuotedLine = {
  courseId: string;
  title: string;
  slug: string;
  unitPrice: number;
  discountApplied: number;
};

export type CheckoutQuote =
  | { ok: false; message: string }
  | {
      ok: true;
      currency: typeof BKASH_CURRENCY;
      lines: QuotedLine[];
      subtotal: number;
      discount: number;
      total: number;
      coupon: CouponRecord | null;
    };

export async function quoteBkashCourses(
  userId: string,
  courseIds: string[],
  couponCode?: string,
): Promise<CheckoutQuote> {
  const unique = [...new Set(courseIds)];
  if (unique.length === 0) return { ok: false, message: "Your cart is empty." };

  const courses = await db.course.findMany({
    where: { id: { in: unique }, status: "PUBLISHED" },
    select: {
      id: true,
      title: true,
      slug: true,
      prices: { where: { isActive: true }, select: { amount: true, currency: true } },
    },
  });

  if (courses.length !== unique.length) {
    return { ok: false, message: "A course in this checkout is no longer available." };
  }

  const lines: QuotedLine[] = [];
  for (const course of courses) {
    if (await isEnrolled(userId, course.id)) {
      return { ok: false, message: `You already have access to ${course.title}.` };
    }
    if (isFreeCourse(course.prices)) {
      return { ok: false, message: `${course.title} is free — enrol it instead of paying.` };
    }
    const bdt = course.prices.find((price) => price.currency === BKASH_CURRENCY);
    if (!bdt || bdt.amount <= 0) {
      return {
        ok: false,
        message: `${course.title} has no bKash (BDT) price, so it cannot be bought this way.`,
      };
    }
    lines.push({
      courseId: course.id,
      title: course.title,
      slug: course.slug,
      unitPrice: bdt.amount,
      discountApplied: 0,
    });
  }

  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice, 0);
  let breakdown: DiscountBreakdown = { discount: 0, perItem: {} };
  let coupon: CouponRecord | null = null;

  if (couponCode && couponCode.trim()) {
    const looked = await lookupCoupon(couponCode);
    if (!looked.ok) return looked;
    if (!couponAppliesToCart(looked.coupon, lines.map((line) => line.courseId))) {
      return { ok: false, message: "That coupon does not apply to these courses." };
    }
    if (await hasRedeemedCoupon(userId, looked.coupon.id)) {
      return { ok: false, message: "You have already used that coupon." };
    }
    coupon = looked.coupon;
    breakdown = applyCouponToItems(lines, coupon);
  }

  for (const line of lines) {
    line.discountApplied = breakdown.perItem[line.courseId] ?? 0;
  }

  return {
    ok: true,
    currency: BKASH_CURRENCY,
    lines,
    subtotal,
    discount: breakdown.discount,
    total: subtotal - breakdown.discount,
    coupon,
  };
}

/**
 * What the learner must send via bKash. Always the quoted total after coupon,
 * never the raw subtotal — the Order/Payment row is this figure, not a number
 * the browser invented.
 */
export function bkashAmountDue(quote: Extract<CheckoutQuote, { ok: true }>): number {
  return quote.total;
}

/**
 * Coupon the bKash submit form must post. Taken from the quote, never from the
 * raw `?coupon=` string — a rejected code must not be what Order/Payment store.
 */
export function quotedBkashCouponCode(quote: Extract<CheckoutQuote, { ok: true }>): string {
  return quote.coupon?.code ?? "";
}

/**
 * A checkout page that takes `?coupon=` still needs a payable quote when the
 * code is rejected: show the list-price total and the lookup error, then retry
 * without the coupon.
 */
export function applyCouponQueryResult(
  quoted: CheckoutQuote,
  couponQuery: string | undefined,
): { couponMessage: string | null; retryWithoutCoupon: boolean } {
  if (!quoted.ok && couponQuery) {
    return { couponMessage: quoted.message, retryWithoutCoupon: true };
  }
  return { couponMessage: null, retryWithoutCoupon: false };
}

/**
 * A fully discounted quote still goes through an order so the coupon redemption
 * is recorded, then grantEnrollment is the only write that opens the course.
 */
export async function fulfillZeroTotalQuote(
  userId: string,
  quote: Extract<CheckoutQuote, { ok: true }>,
): Promise<{ orderId: string }> {
  if (quote.total !== 0) {
    throw new Error("Zero-total checkout was called with a remaining balance.");
  }

  const orderId = await db.$transaction(async (tx) => {
    await assertNoInFlightPayment(
      tx,
      userId,
      quote.lines.map((line) => line.courseId),
    );

    const order = await tx.order.create({
      data: {
        userId,
        status: "PAID",
        currency: quote.currency,
        subtotal: quote.subtotal,
        discount: quote.discount,
        total: 0,
        paidAt: new Date(),
        items: {
          create: quote.lines.map((line) => ({
            courseId: line.courseId,
            unitPrice: line.unitPrice,
            discountApplied: line.discountApplied,
          })),
        },
      },
    });
    if (quote.coupon) {
      // Immediate grant: consume the cap now, unlike pending bKash reservations.
      await reserveCoupon(tx, {
        couponId: quote.coupon.id,
        userId,
        orderId: order.id,
      });
      await commitCouponReservation(tx, order.id);
    }
    for (const line of quote.lines) {
      await grantEnrollment(userId, line.courseId, "PURCHASE", tx);
    }
    return order.id;
  });

  return { orderId };
}
