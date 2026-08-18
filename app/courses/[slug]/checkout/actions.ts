"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fulfillZeroTotalQuote, quoteBkashCourses } from "@/lib/checkout";
import { CouponFullyRedeemedError } from "@/lib/coupons";
import { db } from "@/lib/db";
import { isEnrolled } from "@/lib/entitlement";
import {
  assertNoInFlightPayment,
  bkashCheckoutIdentitySchema,
  bkashManualRail,
  bkashProofSchema,
  DuplicateBkashTransactionError,
  InFlightPaymentError,
  stripeRail,
} from "@/lib/payments";
import { getCurrentUser, requireUser } from "@/lib/session";

export type SubmitState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> }
  | { status: "submitted" };

export async function submitBkashPayment(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "You need to sign in first." };

  const identity = bkashCheckoutIdentitySchema.safeParse({
    courseId: formData.get("courseId"),
    couponCode: formData.get("couponCode") ?? "",
  });
  if (!identity.success) {
    return { status: "error", message: "Course is missing from this checkout." };
  }

  const quote = await quoteBkashCourses(
    user.id,
    [identity.data.courseId],
    identity.data.couponCode || undefined,
  );
  if (!quote.ok) return { status: "error", message: quote.message };

  const course = quote.lines[0];
  if (!course) return { status: "error", message: "Course not found." };

  try {
    await db.$transaction((tx) => assertNoInFlightPayment(tx, user.id, [course.courseId]));
  } catch (error) {
    if (error instanceof InFlightPaymentError) {
      return { status: "error", message: error.message };
    }
    throw error;
  }

  if (quote.total === 0) {
    try {
      await fulfillZeroTotalQuote(user.id, quote);
    } catch (error) {
      if (error instanceof CouponFullyRedeemedError) {
        return { status: "error", message: error.message };
      }
      if (error instanceof InFlightPaymentError) {
        return { status: "error", message: error.message };
      }
      throw error;
    }
    revalidatePath(`/courses/${course.slug}`);
    revalidatePath("/dashboard");
    redirect(`/learn/${course.slug}` as Route);
  }

  const proof = bkashProofSchema.safeParse({
    transactionId: formData.get("transactionId"),
    phoneNumber: formData.get("phoneNumber"),
    paymentDate: formData.get("paymentDate"),
    reference: formData.get("reference") ?? "",
  });
  if (!proof.success) {
    return {
      status: "error",
      message: "Check the details below.",
      fieldErrors: proof.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  // Records the claim only. Access is granted at approval, never here.
  try {
    await bkashManualRail.submitProof({
      userId: user.id,
      items: quote.lines.map((line) => ({
        courseId: line.courseId,
        unitPrice: line.unitPrice,
        discountApplied: line.discountApplied,
      })),
      amount: quote.total,
      discount: quote.discount,
      couponId: quote.coupon?.id ?? null,
      proof: {
        transactionId: proof.data.transactionId,
        phoneNumber: proof.data.phoneNumber,
        paymentDate: proof.data.paymentDate,
        reference: proof.data.reference ?? null,
      },
    });
  } catch (error) {
    if (error instanceof CouponFullyRedeemedError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof DuplicateBkashTransactionError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof InFlightPaymentError) {
      return { status: "error", message: error.message };
    }
    throw error;
  }

  revalidatePath(`/courses/${course.slug}`);
  revalidatePath("/dashboard");

  return { status: "submitted" };
}

/**
 * Starts a Stripe Checkout session and sends the learner to Stripe.
 *
 * The amount is read from the Price table here, never from the form (invariant
 * 6) — the only thing the form supplies is which course. Nothing is granted on
 * return; access arrives when the webhook confirms the payment.
 */
export async function startStripeCheckout(formData: FormData): Promise<void> {
  const courseId = String(formData.get("courseId") ?? "");

  const course = await db.course.findFirst({
    where: { id: courseId, status: "PUBLISHED" },
    select: {
      id: true,
      slug: true,
      prices: {
        where: { isActive: true, currency: stripeRail.currency },
        select: { amount: true },
      },
    },
  });
  if (!course) redirect("/courses");

  const checkoutPath = `/courses/${course.slug}/checkout`;
  const user = await requireUser(checkoutPath);

  if (await isEnrolled(user.id, course.id)) {
    // typedRoutes cannot validate runtime-built strings; the template is a
    // known route literal, so the cast is contained (same as lib/session.ts).
    redirect(checkoutPath as Route);
  }

  const price = course.prices[0];
  if (!stripeRail.isConfigured() || !price) {
    redirect(`${checkoutPath}?status=unavailable` as Route);
  }

  // Same source of truth as Better Auth's base URL — the app's own origin.
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

  let redirectUrl: string;
  try {
    const session = await stripeRail.createSession({
      userId: user.id,
      courseId: course.id,
      amount: price.amount,
      returnUrl: `${base}${checkoutPath}`,
    });
    redirectUrl = session.redirectUrl;
  } catch (error) {
    if (error instanceof InFlightPaymentError) {
      redirect(`${checkoutPath}?status=in-flight` as Route);
    }
    console.error("Stripe checkout session creation failed:", error);
    redirect(`${checkoutPath}?status=error` as Route);
  }

  // Off-site URL — outside typedRoutes' vocabulary by definition.
  redirect(redirectUrl as Route);
}
