import { db } from "@/lib/db";
import { isFreeCourse } from "@/lib/courses";
import { isEnrolled } from "@/lib/entitlement";
import { BKASH_CURRENCY } from "@/lib/payments";

/**
 * The learner's cart. Access is never granted from here — adding a course only
 * records intent. grantEnrollment remains the only write that opens a course
 * (invariant 7), and it is called from checkout after money (or a free price)
 * is confirmed.
 */

export type CartLine = {
  courseId: string;
  title: string;
  slug: string;
  addedAt: Date;
  prices: { amount: number; currency: string }[];
  isFree: boolean;
  enrolled: boolean;
};

async function cartIdFor(userId: string): Promise<string> {
  // Upsert, not find-then-create: two first-time adds racing the unique userId
  // would otherwise 500 on the second INSERT. ON CONFLICT just returns the row.
  const cart = await db.cart.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: { id: true },
  });
  return cart.id;
}

export async function addToCart(userId: string, courseId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const course = await db.course.findFirst({
    where: { id: courseId, status: "PUBLISHED" },
    select: { id: true },
  });
  if (!course) return { ok: false, message: "Course not found." };

  if (await isEnrolled(userId, courseId)) {
    return { ok: false, message: "You already have access to this course." };
  }

  const id = await cartIdFor(userId);
  await db.cartItem.upsert({
    where: { cartId_courseId: { cartId: id, courseId } },
    create: { cartId: id, courseId },
    update: {},
  });

  return { ok: true };
}

export async function removeFromCart(userId: string, courseId: string): Promise<void> {
  const cart = await db.cart.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!cart) return;

  await db.cartItem.deleteMany({ where: { cartId: cart.id, courseId } });
}

export async function clearCart(userId: string, courseIds?: string[]): Promise<void> {
  const cart = await db.cart.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!cart) return;

  await db.cartItem.deleteMany({
    where: {
      cartId: cart.id,
      ...(courseIds ? { courseId: { in: courseIds } } : {}),
    },
  });
}

/**
 * Rows getCart shows and the header badge must count. Unpublished courses stay
 * in the cart table (addToCart only accepts published ones; an instructor can
 * take a course down afterwards) but they are not checkoutable, so they must
 * not inflate the badge.
 */
const publishedCartCourse = { status: "PUBLISHED" as const };

export async function getCart(userId: string): Promise<{ id: string; items: CartLine[] } | null> {
  const cart = await db.cart.findUnique({
    where: { userId },
    select: {
      id: true,
      items: {
        where: { course: publishedCartCourse },
        orderBy: { addedAt: "asc" },
        select: {
          addedAt: true,
          course: {
            select: {
              id: true,
              title: true,
              slug: true,
              prices: {
                where: { isActive: true },
                orderBy: { currency: "asc" },
                select: { amount: true, currency: true },
              },
            },
          },
        },
      },
    },
  });

  if (!cart) return { id: await cartIdFor(userId), items: [] };

  const lines: CartLine[] = [];
  for (const item of cart.items) {
    lines.push({
      courseId: item.course.id,
      title: item.course.title,
      slug: item.course.slug,
      addedAt: item.addedAt,
      prices: item.course.prices,
      isFree: isFreeCourse(item.course.prices),
      enrolled: await isEnrolled(userId, item.course.id),
    });
  }

  return { id: cart.id, items: lines };
}

export async function cartItemCount(userId: string): Promise<number> {
  return db.cartItem.count({
    where: {
      cart: { userId },
      course: publishedCartCourse,
    },
  });
}

export type CheckoutLine = {
  courseId: string;
  title: string;
  slug: string;
  unitPrice: number;
  currency: string;
};

/**
 * The bKash-priced lines a checkout can actually charge for.
 *
 * Free (every rail zero) and already-enrolled courses are split out so the
 * payment form never asks for money on them. A published course with no BDT
 * price cannot go through this rail at all — that is a pricing gap, not a
 * free course.
 */
export function partitionCheckoutLines(items: CartLine[]): {
  owned: CartLine[];
  free: CartLine[];
  payable: CheckoutLine[];
  unpriced: CartLine[];
} {
  const owned: CartLine[] = [];
  const free: CartLine[] = [];
  const payable: CheckoutLine[] = [];
  const unpriced: CartLine[] = [];

  for (const item of items) {
    if (item.enrolled) {
      owned.push(item);
      continue;
    }
    if (item.isFree) {
      free.push(item);
      continue;
    }
    const bdt = item.prices.find((price) => price.currency === BKASH_CURRENCY);
    if (!bdt || bdt.amount <= 0) {
      unpriced.push(item);
      continue;
    }
    payable.push({
      courseId: item.courseId,
      title: item.title,
      slug: item.slug,
      unitPrice: bdt.amount,
      currency: bdt.currency,
    });
  }

  return { owned, free, payable, unpriced };
}
