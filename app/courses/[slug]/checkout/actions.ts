"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { isEnrolled } from "@/lib/entitlement";
import { bkashManualRail, BKASH_CURRENCY, bkashSubmissionSchema } from "@/lib/payments";
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
