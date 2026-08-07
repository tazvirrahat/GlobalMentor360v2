"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { isEnrolled } from "@/lib/entitlement";
import { bkashManualRail, BKASH_CURRENCY, bkashSubmissionSchema, stripeRail } from "@/lib/payments";
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

  const parsed = bkashSubmissionSchema.safeParse({
    courseId: formData.get("courseId"),
    transactionId: formData.get("transactionId"),
    phoneNumber: formData.get("phoneNumber"),
    paymentDate: formData.get("paymentDate"),
    reference: formData.get("reference") ?? "",
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the details below.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const input = parsed.data;

  const course = await db.course.findFirst({
    where: { id: input.courseId, status: "PUBLISHED" },
    select: {
      id: true,
      slug: true,
      // Each rail settles in one currency, so the price must exist in it. Taking
      // the USD price and relabelling it BDT would record a wildly wrong amount —
      // 4900 USD-cents is not 4900 poisha.
      prices: {
        where: { isActive: true, currency: bkashManualRail.currency },
        select: { amount: true, currency: true },
      },
    },
  });

  if (!course) return { status: "error", message: "Course not found." };

  if (await isEnrolled(user.id, course.id)) {
    return { status: "error", message: "You already have access to this course." };
  }

  // Price comes from the database, never the form (invariant 6). The amount is
  // not a field the learner can influence.
  const price = course.prices[0];
  if (!price) {
    return {
      status: "error",
      message: `bKash isn't available for this course yet — it has no ${BKASH_CURRENCY} price.`,
    };
  }

  const existing = await db.payment.findFirst({
    where: {
      userId: user.id,
      // Scoped to this rail: an abandoned Stripe attempt leaves a PENDING
      // STRIPE payment behind, and that must not lock the learner out of bKash.
      method: bkashManualRail.method,
      order: { items: { some: { courseId: course.id } } },
      status: { in: ["PENDING", "PENDING_VERIFICATION"] },
    },
    select: { id: true },
  });

  if (existing) {
    return {
      status: "error",
      message: "You already have a payment awaiting verification for this course.",
    };
  }

  // Records the claim only. Access is granted at approval, never here.
  await bkashManualRail.submitProof({
    userId: user.id,
    courseId: course.id,
    amount: price.amount,
    proof: {
      transactionId: input.transactionId,
      phoneNumber: input.phoneNumber,
      paymentDate: input.paymentDate,
      reference: input.reference ?? null,
    },
  });

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
    redirect(`${checkoutPath}?status=error` as Route);
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
    console.error("Stripe checkout session creation failed:", error);
    redirect(`${checkoutPath}?status=error` as Route);
  }

  // Off-site URL — outside typedRoutes' vocabulary by definition.
  redirect(redirectUrl as Route);
}
