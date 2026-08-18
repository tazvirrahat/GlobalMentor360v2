import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { CouponType } from "@/generated/prisma/enums";

/**
 * Coupons discount a checkout quote. They never invent a price: callers pass
 * amounts already read from the Price table (invariant 6), and this module only
 * decides how much of that total to knock off.
 *
 * A coupon is either global or pinned to one course. Percentage coupons apply
 * independently to each eligible line so two items at 20% off cannot drift from
 * one item at 20% off; fixed coupons consume from eligible lines in order.
 */

export type PricedLine = {
  courseId: string;
  unitPrice: number;
};

export type CouponRecord = {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  courseId: string | null;
  maxRedemptions: number | null;
  redeemedCount: number;
  validFrom: Date | null;
  validUntil: Date | null;
  isActive: boolean;
};

export type DiscountBreakdown = {
  discount: number;
  perItem: Record<string, number>;
};

/**
 * Pure. The interesting cases are a course-scoped coupon on a cart that does not
 * contain that course (zero, not an error — the lookup layer refuses that), a
 * percentage that would otherwise float, and a fixed amount larger than the
 * eligible subtotal (capped, never a negative total).
 */
export function applyCouponToItems(items: PricedLine[], coupon: CouponRecord): DiscountBreakdown {
  const perItem: Record<string, number> = {};
  for (const item of items) perItem[item.courseId] = 0;

  const eligible = coupon.courseId
    ? items.filter((item) => item.courseId === coupon.courseId)
    : items;

  if (eligible.length === 0) return { discount: 0, perItem };

  if (coupon.type === "PERCENTAGE") {
    const pct = Math.min(100, Math.max(0, coupon.value));
    let total = 0;
    for (const item of eligible) {
      const amount = Math.floor((item.unitPrice * pct) / 100);
      perItem[item.courseId] = amount;
      total += amount;
    }
    return { discount: total, perItem };
  }

  let remaining = Math.max(0, coupon.value);
  for (const item of eligible) {
    const amount = Math.min(item.unitPrice, remaining);
    perItem[item.courseId] = amount;
    remaining -= amount;
    if (remaining === 0) break;
  }

  return { discount: coupon.value - remaining > 0 ? coupon.value - remaining : 0, perItem };
}

export type CouponLookup =
  | { ok: true; coupon: CouponRecord }
  | { ok: false; message: string };

function asRecord(row: {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  courseId: string | null;
  maxRedemptions: number | null;
  redeemedCount: number;
  validFrom: Date | null;
  validUntil: Date | null;
  isActive: boolean;
}): CouponRecord {
  return row;
}

/**
 * Normalises what a learner typed. Codes are stored uppercase so "save20" and
 * "SAVE20" cannot be two coupons, and so a lookup cannot miss because of case.
 */
export function normaliseCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

export async function lookupCoupon(code: string, at: Date = new Date()): Promise<CouponLookup> {
  const normalised = normaliseCouponCode(code);
  if (!normalised) return { ok: false, message: "Enter a coupon code." };

  const coupon = await db.coupon.findUnique({ where: { code: normalised } });
  if (!coupon || !coupon.isActive) {
    return { ok: false, message: "That coupon is not valid." };
  }
  if (coupon.validFrom && coupon.validFrom > at) {
    return { ok: false, message: "That coupon is not valid yet." };
  }
  if (coupon.validUntil && coupon.validUntil < at) {
    return { ok: false, message: "That coupon has expired." };
  }
  if (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions) {
    return { ok: false, message: "That coupon has been fully redeemed." };
  }

  return { ok: true, coupon: asRecord(coupon) };
}

/**
 * Whether this user has already used the coupon. Unique on (couponId, userId)
 * is the authority; this read exists so checkout can say so before the write.
 */
export async function hasRedeemedCoupon(userId: string, couponId: string): Promise<boolean> {
  const row = await db.couponRedemption.findUnique({
    where: { couponId_userId: { couponId, userId } },
    select: { id: true },
  });
  return row !== null;
}

type Tx = Prisma.TransactionClient;

/**
 * The increment that makes maxRedemptions a write-time cap rather than a
 * lookup-time hint. Two checkouts can both pass lookupCoupon while a slot is
 * still free; this UPDATE is what refuses the extra one. Column comparison
 * (`redeemedCount < maxRedemptions`) is not expressible as Prisma where.
 */
export class CouponFullyRedeemedError extends Error {
  constructor(message = "That coupon has been fully redeemed.") {
    super(message);
    this.name = "CouponFullyRedeemedError";
  }
}

async function claimRedemptionSlot(tx: Tx, couponId: string): Promise<void> {
  const updated = await tx.$executeRaw`
    UPDATE coupons
    SET "redeemedCount" = "redeemedCount" + 1
    WHERE id = ${couponId}
      AND ("maxRedemptions" IS NULL OR "redeemedCount" < "maxRedemptions")
  `;
  if (Number(updated) === 0) {
    throw new CouponFullyRedeemedError();
  }
}

/**
 * Holds a coupon against an order that is not yet paid. Unique (couponId, userId)
 * is the reservation marker, so the same learner cannot park two checkouts on
 * one code. redeemedCount does *not* move here: a PENDING bKash proof must not
 * consume maxRedemptions. Call commitCouponReservation at approval (or
 * immediately on a zero-total fulfill). Reject/cancel must call
 * releaseCouponReservation so the unique pair does not trap the learner.
 */
export async function reserveCoupon(
  tx: Tx,
  input: { couponId: string; userId: string; orderId: string },
): Promise<void> {
  await tx.couponRedemption.create({
    data: {
      couponId: input.couponId,
      userId: input.userId,
      orderId: input.orderId,
    },
  });
}

/**
 * Claims the maxRedemptions slot for reservations already held on this order.
 * Approve-time (and zero-total fulfill) is when the cap is actually consumed.
 */
export async function commitCouponReservation(tx: Tx, orderId: string): Promise<void> {
  const rows = await tx.couponRedemption.findMany({
    where: { orderId },
    select: { couponId: true },
  });
  for (const row of rows) {
    await claimRedemptionSlot(tx, row.couponId);
  }
}

/**
 * Drops an uncommitted reservation so the unique pair no longer traps the
 * learner. Does not decrement redeemedCount — pending reservations never
 * incremented it.
 */
export async function releaseCouponReservation(tx: Tx, orderId: string): Promise<void> {
  await tx.couponRedemption.deleteMany({ where: { orderId } });
}

/**
 * Catalog-wide coupons (courseId null / "all") bypass a single course's Price
 * row, so only an admin may mint them. Instructors must name a course; ownership
 * is checked by the caller.
 */
export function resolveCouponScope(input: {
  requestedCourseId: string | null | undefined;
  isAdmin: boolean;
}): { ok: true; courseId: string | null } | { ok: false; message: string } {
  const requested =
    !input.requestedCourseId || input.requestedCourseId === "all"
      ? null
      : input.requestedCourseId;
  if (requested === null && !input.isAdmin) {
    return {
      ok: false,
      message: "Only an admin can create a coupon that applies to every course.",
    };
  }
  return { ok: true, courseId: requested };
}

export function couponAppliesToCart(coupon: CouponRecord, courseIds: string[]): boolean {
  if (!coupon.courseId) return true;
  return courseIds.includes(coupon.courseId);
}

export async function createCoupon(input: {
  code: string;
  type: CouponType;
  value: number;
  courseId?: string | null;
  maxRedemptions?: number | null;
  validUntil?: Date | null;
  /** Required to mint a catalog-wide coupon (courseId null / "all"). */
  isAdmin?: boolean;
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const scope = resolveCouponScope({
    requestedCourseId: input.courseId,
    isAdmin: input.isAdmin ?? false,
  });
  if (!scope.ok) return { ok: false, message: scope.message };

  const code = normaliseCouponCode(input.code);
  if (code.length < 3) return { ok: false, message: "Use a code of at least 3 characters." };
  if (input.type === "PERCENTAGE" && (input.value < 1 || input.value > 100)) {
    return { ok: false, message: "Percentage coupons must be between 1 and 100." };
  }
  if (input.type === "FIXED" && input.value < 1) {
    return { ok: false, message: "Fixed coupons must be at least 1 (minor unit)." };
  }

  try {
    const created = await db.coupon.create({
      data: {
        code,
        type: input.type,
        value: input.value,
        courseId: scope.courseId,
        maxRedemptions: input.maxRedemptions ?? null,
        validUntil: input.validUntil ?? null,
      },
      select: { id: true },
    });
    return { ok: true, id: created.id };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return { ok: false, message: "That code is already in use." };
    }
    throw error;
  }
}
