import Stripe from "stripe";
import { db } from "@/lib/db";
import { grantEnrollment } from "@/lib/enrollment";
import { assertNoInFlightPayment } from "./in-flight";
import type { AutomaticRail } from "./rail";

export const STRIPE_CURRENCY = "USD";

/**
 * Stripe by hosted Checkout.
 *
 * The learner is redirected to Stripe, pays there, and Stripe tells us the money
 * landed via a signed webhook. Nothing here trusts the browser: the success
 * redirect is cosmetic, and access is granted only from `confirm`, which
 * verifies the webhook signature against STRIPE_WEBHOOK_SECRET (invariant 5).
 *
 * This is a real integration — see docs/PRIOR-ART.md for why a mock that looks
 * implemented is worse than no rail at all.
 */

// Lazy singleton so importing this module (e.g. during a build without env
// vars) never constructs a client with a missing key.
let client: Stripe | null = null;

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Stripe rail used without STRIPE_SECRET_KEY. Check isConfigured() first.");
  }
  client ??= new Stripe(key);
  return client;
}

/** The ids we stamped on the session at creation; the webhook reads them back. */
type SessionMetadata = {
  orderId: string;
  paymentId: string;
  courseId: string;
  userId: string;
};

function readMetadata(session: Stripe.Checkout.Session): SessionMetadata | null {
  const { orderId, paymentId, courseId, userId } = session.metadata ?? {};
  if (!orderId || !paymentId || !courseId || !userId) return null;
  return { orderId, paymentId, courseId, userId };
}

/**
 * Marks the payment COMPLETED, the order PAID, and grants enrollment — all
 * guarded so a retried webhook is a no-op:
 *
 *   - payment/order updates match only rows not already in their final state
 *     (updateMany with a status filter, so a second delivery updates 0 rows);
 *   - if the payment row did not transition, grantEnrollment is skipped — a
 *     REFUNDED payment must not revive access;
 *   - every order item is granted, not only metadata.courseId;
 *   - session.amount_total must equal the payment amount we stored.
 *
 * The DB CHECK constraint requires a COMPLETED STRIPE payment to carry its
 * payment intent id, so the caller must have one before calling this.
 *
 * Outcomes matter for the webhook ACK: a missing or mismatched row must not
 * look like success, while COMPLETED and REFUNDED are terminal and must ACK.
 */
type FulfillOutcome =
  | "fulfilled"
  | "already_completed"
  | "already_refunded"
  | "missing"
  | "amount_mismatch";

async function fulfill(
  meta: SessionMetadata,
  paymentIntentId: string,
  amountTotal: number | null,
): Promise<FulfillOutcome> {
  const now = new Date();

  return db.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: meta.paymentId },
      select: {
        amount: true,
        status: true,
        order: { select: { items: { select: { courseId: true } } } },
      },
    });
    if (!payment) {
      console.error(
        `Stripe fulfill skipped: payment ${meta.paymentId} is missing (session order ${meta.orderId}).`,
      );
      return "missing";
    }

    if (amountTotal !== payment.amount) {
      console.error(
        `Stripe session amount ${amountTotal} does not match payment ${meta.paymentId} amount ${payment.amount}; skipping fulfill.`,
      );
      return "amount_mismatch";
    }

    if (payment.status === "COMPLETED") return "already_completed";
    if (payment.status === "REFUNDED") return "already_refunded";

    const moved = await tx.payment.updateMany({
      where: { id: meta.paymentId, status: { notIn: ["COMPLETED", "REFUNDED"] } },
      data: { status: "COMPLETED", stripePaymentIntentId: paymentIntentId, paidAt: now },
    });

    // Race: another delivery completed or a refund landed between the read and
    // the write. Re-read so we ACK terminal states and retry anything else.
    if (moved.count === 0) {
      const current = await tx.payment.findUnique({
        where: { id: meta.paymentId },
        select: { status: true },
      });
      if (current?.status === "COMPLETED") return "already_completed";
      if (current?.status === "REFUNDED") return "already_refunded";
      console.error(
        `Stripe fulfill skipped: payment ${meta.paymentId} did not transition (status=${current?.status ?? "missing"}).`,
      );
      return "missing";
    }

    await tx.order.updateMany({
      where: { id: meta.orderId, status: "PENDING" },
      data: { status: "PAID", paidAt: now },
    });

    for (const item of payment.order.items) {
      await grantEnrollment(meta.userId, item.courseId, "PURCHASE", tx);
    }

    return "fulfilled";
  });
}

/**
 * Marks an abandoned or failed session's rows FAILED. Guarded the same way:
 * only PENDING rows move, so a stray `expired` arriving after a successful
 * payment (or a retry of `async_payment_failed`) changes nothing.
 */
async function markFailed(meta: SessionMetadata): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.payment.updateMany({
      where: { id: meta.paymentId, status: "PENDING" },
      data: { status: "FAILED" },
    });

    await tx.order.updateMany({
      where: { id: meta.orderId, status: "PENDING" },
      data: { status: "FAILED" },
    });
  });
}

export const stripeRail: AutomaticRail = {
  id: "stripe",
  method: "STRIPE",
  kind: "automatic",
  currency: STRIPE_CURRENCY,
  label: "Card (Stripe)",

  isConfigured() {
    return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
  },

  async createSession(input) {
    const stripe = getStripe();

    // Re-read the published USD price. The amount the caller passed is not
    // trusted (invariant 6) — a stale checkout page must not set the charge.
    const course = await db.course.findFirst({
      where: { id: input.courseId, status: "PUBLISHED" },
      select: {
        title: true,
        prices: {
          where: { isActive: true, currency: STRIPE_CURRENCY },
          select: { amount: true },
        },
      },
    });
    if (!course) {
      throw new Error(`Course ${input.courseId} is not available for card checkout.`);
    }
    const amount = course.prices[0]?.amount;
    if (amount === undefined || !Number.isInteger(amount) || amount <= 0) {
      throw new Error(`Course ${input.courseId} has no active ${STRIPE_CURRENCY} price.`);
    }

    const { orderId, paymentId } = await db.$transaction(async (tx) => {
      await assertNoInFlightPayment(tx, input.userId, [input.courseId]);

      const order = await tx.order.create({
        data: {
          userId: input.userId,
          status: "PENDING",
          currency: STRIPE_CURRENCY,
          subtotal: amount,
          total: amount,
          items: { create: { courseId: input.courseId, unitPrice: amount } },
        },
      });

      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          userId: input.userId,
          method: "STRIPE",
          // Deliberately PENDING, never PENDING_VERIFICATION — the DB
          // constraint reserves that status for manual rails. COMPLETED
          // happens only in confirm(), with the payment intent in hand.
          status: "PENDING",
          amount,
          currency: STRIPE_CURRENCY,
        },
      });

      return { orderId: order.id, paymentId: payment.id };
    });

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: STRIPE_CURRENCY.toLowerCase(),
              unit_amount: amount,
              product_data: { name: course.title },
            },
          },
        ],
        success_url: `${input.returnUrl}?status=success`,
        cancel_url: `${input.returnUrl}?status=cancelled`,
        client_reference_id: orderId,
        // The webhook reads these back — they are the only link from a Stripe
        // event to our rows, so confirm() never has to guess.
        metadata: { orderId, paymentId, courseId: input.courseId, userId: input.userId },
      });
    } catch (error) {
      // The order can never complete without a session; fail it so it doesn't
      // linger as a phantom PENDING purchase.
      await markFailed({
        orderId,
        paymentId,
        courseId: input.courseId,
        userId: input.userId,
      });
      throw error;
    }

    if (!session.url) {
      await markFailed({ orderId, paymentId, courseId: input.courseId, userId: input.userId });
      throw new Error(`Stripe session ${session.id} has no redirect URL.`);
    }

    await db.order.update({
      where: { id: orderId },
      data: { providerRef: session.id },
    });

    return { redirectUrl: session.url, providerRef: session.id };
  },

  async confirm(payload) {
    if (!this.isConfigured()) return null;

    const signature = payload.headers["stripe-signature"];
    if (!signature) return null;

    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(
        payload.rawBody,
        signature,
        // isConfigured() above guarantees this is set.
        process.env.STRIPE_WEBHOOK_SECRET as string,
      );
    } catch {
      // Bad signature, replayed timestamp, or a body that isn't Stripe's.
      // Null tells the route to answer 401 — never process an unverified body.
      return null;
    }

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        const meta = readMetadata(session);
        if (!meta) return { paid: false, providerRef: session.id };

        // `completed` fires for delayed payment methods before the money moves
        // (payment_status "unpaid"); fulfillment then belongs to
        // async_payment_succeeded. Only a paid session grants anything.
        if (session.payment_status !== "paid") {
          return { paid: false, providerRef: session.id };
        }

        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : (session.payment_intent?.id ?? null);
        // The COMPLETED write is impossible without the intent (DB CHECK
        // constraint), and a paid payment-mode session always carries one.
        if (!paymentIntentId) return { paid: false, providerRef: session.id };

        const outcome = await fulfill(meta, paymentIntentId, session.amount_total ?? null);
        if (outcome === "fulfilled" || outcome === "already_completed") {
          return { paid: true, providerRef: session.id };
        }
        if (outcome === "already_refunded") {
          return { paid: false, providerRef: session.id };
        }

        console.error(
          `Stripe fulfill ${outcome} for payment ${meta.paymentId} session ${session.id}; refusing to ACK so Stripe retries.`,
        );
        return { paid: false, providerRef: session.id, retry: true };
      }

      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const session = event.data.object;
        const meta = readMetadata(session);
        if (meta) await markFailed(meta);
        return { paid: false, providerRef: session.id };
      }

      default:
        // Verified but not ours to act on. 200 so Stripe stops retrying it.
        return { paid: false, providerRef: event.id };
    }
  },
};
