"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { isEnrolled } from "@/lib/entitlement";
import { BKASH_CURRENCY, bkashSubmissionSchema } from "@/lib/payments";
import { getCurrentUser } from "@/lib/session";

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
      // bKash settles in BDT, so the BDT price is the only valid basis for this
      // rail. Taking the USD price and relabelling it BDT would record a wildly
      // wrong amount — 4900 USD-cents is not 4900 poisha.
      prices: {
        where: { isActive: true, currency: BKASH_CURRENCY },
        select: { amount: true, currency: true },
      },
    },
  });

  if (!course) return { status: "error", message: "Course not found." };

  if (await isEnrolled(user.id, course.id)) {
    return { status: "error", message: "You already have access to this course." };
  }

  // Price comes from the database, never the form (invariant 6). The submitted
  // amount is not a field the learner can influence.
  const price = course.prices[0];
  if (!price) {
    return {
      status: "error",
      message: "bKash isn't available for this course yet — it has no BDT price.",
    };
  }

  const existing = await db.payment.findFirst({
    where: {
      userId: user.id,
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

  await db.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        userId: user.id,
        status: "PENDING",
        currency: BKASH_CURRENCY,
        subtotal: price.amount,
        total: price.amount,
        items: {
          create: { courseId: course.id, unitPrice: price.amount },
        },
      },
    });

    await tx.payment.create({
      data: {
        orderId: order.id,
        userId: user.id,
        method: "BKASH",
        // No enrollment is created here. Access is granted only when an admin
        // approves — that is the entire point of the manual rail.
        status: "PENDING_VERIFICATION",
        amount: price.amount,
        currency: BKASH_CURRENCY,
        bkashTransactionId: input.transactionId,
        bkashPhoneNumber: input.phoneNumber,
        bkashPaymentDate: new Date(input.paymentDate),
        bkashReference: input.reference ? input.reference : null,
      },
    });
  });

  revalidatePath(`/courses/${course.slug}`);
  revalidatePath("/dashboard");

  return { status: "submitted" };
}
