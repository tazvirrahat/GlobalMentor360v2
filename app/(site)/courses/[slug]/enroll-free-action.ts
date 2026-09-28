"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isFreeCourse } from "@/lib/courses";
import { db } from "@/lib/db";
import { grantEnrollment } from "@/lib/enrollment";
import { isEnrolled } from "@/lib/entitlement";
import { getCurrentUser } from "@/lib/session";

/**
 * Free enrolment: the one purchase path that needs no payment rail.
 *
 * A course is free when every active price is 0 — see `isFreeCourse`. The same
 * predicate decides whether the landing page offers the button, so the two
 * cannot drift into a button that silently refuses.
 *
 * The check runs here, server-side — "free" is a property of the course, never a
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

  if (!isFreeCourse(course.prices)) return;

  if (!(await isEnrolled(user.id, course.id))) {
    await grantEnrollment(user.id, course.id, "FREE");
  }

  revalidatePath(`/courses/${course.slug}`);
  revalidatePath("/dashboard");
  redirect(`/learn/${course.slug}` as Route);
}
