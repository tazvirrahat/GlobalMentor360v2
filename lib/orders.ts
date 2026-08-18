import { db } from "@/lib/db";
import { clampPage, pageCount, skipTake, type Paged } from "@/lib/pagination";

/**
 * The learner's own purchase record.
 *
 * Read-only over Order, OrderItem and Payment. Nothing here decides access —
 * entitlement is the Enrollment row (invariant 1), and an order is only the
 * story of how one came to exist. A refunded learner still has the order; what
 * they no longer have is the enrollment.
 *
 * Every query is scoped by `userId` inside the `where`, never filtered after the
 * fetch: an order carries what someone paid and how, and the difference between
 * "scoped in the query" and "checked afterwards" is one early return.
 */

/** Orders per page. Bounded for the same reason every other learner list is. */
export const ORDER_PAGE_SIZE = 20;

export type OrderLine = {
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  unitPrice: number;
  discountApplied: number;
};

export type OrderPaymentSummary = {
  method: string;
  status: string;
  /** The identifier the learner can reconcile against their own records. */
  reference: string | null;
  paidAt: Date | null;
};

export type LearnerOrder = {
  id: string;
  status: string;
  currency: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  createdAt: Date;
  paidAt: Date | null;
  items: OrderLine[];
  payments: OrderPaymentSummary[];
};

/**
 * One shape for the list and the receipt.
 *
 * Both read the same thing and differ only in their `where`, so they share this
 * select and the mapper below rather than carrying two copies that agree until
 * someone edits one. That divergence has bitten this codebase three times now
 * (lib/progress.ts, lib/qa.ts, and the reviews aggregate).
 */
const ORDER_SELECT = {
  id: true,
  status: true,
  currency: true,
  subtotal: true,
  discount: true,
  tax: true,
  total: true,
  createdAt: true,
  paidAt: true,
  items: {
    select: {
      courseId: true,
      unitPrice: true,
      discountApplied: true,
      course: { select: { title: true, slug: true } },
    },
  },
  payments: {
    orderBy: { createdAt: "desc" },
    select: {
      method: true,
      status: true,
      paidAt: true,
      bkashTransactionId: true,
      stripePaymentIntentId: true,
    },
  },
} as const;

type OrderRow = {
  id: string;
  status: string;
  currency: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  createdAt: Date;
  paidAt: Date | null;
  items: {
    courseId: string;
    unitPrice: number;
    discountApplied: number;
    course: { title: string; slug: string };
  }[];
  payments: {
    method: string;
    status: string;
    paidAt: Date | null;
    bkashTransactionId: string | null;
    stripePaymentIntentId: string | null;
  }[];
};

/**
 * Which identifier a learner can actually reconcile against their own records.
 *
 * For bKash that is the transaction id they typed in themselves. For Stripe it
 * is the payment intent — long, but it is what Stripe support asks for. Neither
 * is a secret: both identify a payment this learner made, shown to that learner
 * on their own order.
 */
function paymentReference(payment: OrderRow["payments"][number]): string | null {
  return payment.method === "BKASH"
    ? payment.bkashTransactionId
    : payment.stripePaymentIntentId;
}

function toLearnerOrder(order: OrderRow): LearnerOrder {
  return {
    id: order.id,
    status: order.status,
    currency: order.currency,
    subtotal: order.subtotal,
    discount: order.discount,
    tax: order.tax,
    total: order.total,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    items: order.items.map((item) => ({
      courseId: item.courseId,
      courseTitle: item.course.title,
      courseSlug: item.course.slug,
      unitPrice: item.unitPrice,
      discountApplied: item.discountApplied,
    })),
    payments: order.payments.map((payment) => ({
      method: payment.method,
      status: payment.status,
      reference: paymentReference(payment),
      paidAt: payment.paidAt,
    })),
  };
}

export async function listLearnerOrders(userId: string, page?: string | number): Promise<Paged<LearnerOrder>> {
  const where = { userId };
  const total = await db.order.count({ where });
  const current = clampPage(page ?? 1, total, ORDER_PAGE_SIZE);
  const { skip, take } = skipTake(current, ORDER_PAGE_SIZE);
  const orders = await db.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip,
    take,
    select: ORDER_SELECT,
  });

  return {
    items: orders.map(toLearnerOrder),
    total,
    page: current,
    pageCount: pageCount(total, ORDER_PAGE_SIZE),
  };
}

/**
 * One order, for the receipt page.
 *
 * `userId` is part of the lookup rather than compared afterwards, so another
 * learner's order id resolves to null instead of to a receipt showing what
 * somebody else paid and which card they used.
 */
export async function getLearnerOrder(
  userId: string,
  orderId: string,
): Promise<LearnerOrder | null> {
  const order = await db.order.findFirst({
    where: { id: orderId, userId },
    select: ORDER_SELECT,
  });

  return order ? toLearnerOrder(order) : null;
}
