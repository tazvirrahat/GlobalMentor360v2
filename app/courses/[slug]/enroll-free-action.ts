"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { grantEnrollment } from "@/lib/enrollment";
import { isEnrolled } from "@/lib/entitlement";
import { getCurrentUser } from "@/lib/session";

/**
 * Free enrolment: the one purchase path that needs no payment rail.
 *
 * A course is free when it has no active price or an active price of 0. The
 * check runs here, server-side — "free" is a property of the course, never a
 * claim the browser gets to make (invariant 6: server-side prices).
 */
export async function enrollFree(formData: FormData) {
  const courseId = formData.get("courseId");
  if (typeof courseId !== "string" || courseId.length === 0) return;

  const user = await getCurrentUser();

  const course = await db.course.findFirst({
    where: { id: courseId, status: "PUBLISHED" },
    select: {
      id: true,
      slug: true,
      prices: { where: { isActive: true }, select: { amount: true } },
    },
  });
  if (!course) return;

  if (!user) {
    redirect(`/sign-in?next=${encodeURIComponent(`/courses/${course.slug}`)}`);
  }

  const isFree = course.prices.length === 0 || course.prices.every((p) => p.amount === 0);
  if (!isFree) return;

  if (!(await isEnrolled(user.id, course.id))) {
    await grantEnrollment(user.id, course.id, "FREE");
  }

  revalidatePath(`/courses/${course.slug}`);
  revalidatePath("/dashboard");
  redirect(`/learn/${course.slug}`);
}
