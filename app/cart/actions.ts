"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addToCart, clearCart, getCart, partitionCheckoutLines, removeFromCart } from "@/lib/cart";
import { fulfillZeroTotalQuote, quoteBkashCourses } from "@/lib/checkout";
import { CouponFullyRedeemedError } from "@/lib/coupons";
import { db } from "@/lib/db";
import { grantEnrollment } from "@/lib/enrollment";
import {
  assertNoInFlightPayment,
  bkashCartIdentitySchema,
  bkashManualRail,
  bkashProofSchema,
  DuplicateBkashTransactionError,
  InFlightPaymentError,
} from "@/lib/payments";
import { getCurrentUser, requireUser } from "@/lib/session";

export type CartState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

export async function addCourseToCart(formData: FormData): Promise<void> {
  const courseId = String(formData.get("courseId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const user = await requireUser(`/courses/${slug}`);
  const result = await addToCart(user.id, courseId);
  if (!result.ok) {
    redirect((`/courses/${slug}?cart=${encodeURIComponent(result.message)}` as Route));
  }
  revalidatePath("/cart");
  revalidatePath(`/courses/${slug}`);
  redirect("/cart" as Route);
}

export async function removeCourseFromCart(formData: FormData): Promise<void> {
  const user = await requireUser("/cart");
  await removeFromCart(user.id, String(formData.get("courseId") ?? ""));
  revalidatePath("/cart");
}

export async function enrollFreeCartItems(): Promise<CartState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "You need to sign in first." };

  const cart = await getCart(user.id);
  if (!cart) return { status: "error", message: "Your cart is empty." };

  const { free } = partitionCheckoutLines(cart.items);
  if (free.length === 0) return { status: "error", message: "No free courses in the cart." };

  for (const item of free) {
    await grantEnrollment(user.id, item.courseId, "FREE");
  }
  await clearCart(user.id, free.map((item) => item.courseId));
  revalidatePath("/cart");
  revalidatePath("/dashboard");
  return { status: "done", message: `Enrolled in ${free.length} free ${free.length === 1 ? "course" : "courses"}.` };
}

export type SubmitState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> }
  | { status: "submitted" };

export async function submitCartBkash(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "You need to sign in first." };

  const identity = bkashCartIdentitySchema.safeParse({
    couponCode: formData.get("couponCode") ?? "",
  });
  if (!identity.success) {
    return { status: "error", message: "Check the coupon code and try again." };
  }

  const cart = await getCart(user.id);
  if (!cart) return { status: "error", message: "Your cart is empty." };

  const { payable, free } = partitionCheckoutLines(cart.items);
  for (const item of free) {
    await grantEnrollment(user.id, item.courseId, "FREE");
  }
  if (free.length > 0) {
    await clearCart(
      user.id,
      free.map((item) => item.courseId),
    );
  }

  if (payable.length === 0) {
    revalidatePath("/cart");
    revalidatePath("/dashboard");
    return { status: "error", message: "Nothing left to pay for — free courses were enrolled." };
  }

  const quote = await quoteBkashCourses(
    user.id,
    payable.map((item) => item.courseId),
    identity.data.couponCode || undefined,
  );
  if (!quote.ok) return { status: "error", message: quote.message };

  try {
    await db.$transaction((tx) =>
      assertNoInFlightPayment(
        tx,
        user.id,
        quote.lines.map((line) => line.courseId),
      ),
    );
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
    await clearCart(
      user.id,
      quote.lines.map((line) => line.courseId),
    );
    revalidatePath("/cart");
    revalidatePath("/dashboard");
    redirect("/dashboard" as Route);
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

  await clearCart(
    user.id,
    quote.lines.map((line) => line.courseId),
  );

  revalidatePath("/cart");
  revalidatePath("/dashboard");
  return { status: "submitted" };
}
