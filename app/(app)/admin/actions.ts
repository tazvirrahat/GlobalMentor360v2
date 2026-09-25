"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminSetCoursePublished, setReviewVisibility, setUserRole } from "@/lib/admin";
import type { Role } from "@/generated/prisma/enums";
import { approveReview, returnReview } from "@/lib/course-review";
import { processAdminRefund } from "@/lib/refunds";
import { requireRole } from "@/lib/session";

const ROLES: Role[] = ["LEARNER", "INSTRUCTOR", "ADMIN"];

export async function updateUserRoleAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "") as Role;
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!ROLES.includes(role)) return;

  const result = await setUserRole(admin.id, userId, role, enabled);
  if (!result.ok) {
    redirect(`/admin/users?error=${encodeURIComponent(result.message)}` as Route);
  }
  revalidatePath("/admin/users");
}

export async function publishCourseAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const courseId = String(formData.get("courseId") ?? "");
  const publish = String(formData.get("publish") ?? "") === "true";
  const result = await adminSetCoursePublished(admin.id, courseId, publish);
  if (!result.ok) {
    redirect(`/admin/courses?error=${encodeURIComponent(result.message)}` as Route);
  }
  revalidatePath("/admin/courses");
  revalidatePath(`/admin/courses/${courseId}`);
  revalidatePath("/courses");
}

export async function moderateReviewAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const reviewId = String(formData.get("reviewId") ?? "");
  const visible = String(formData.get("visible") ?? "") === "true";
  const result = await setReviewVisibility(admin.id, reviewId, visible);
  if (!result.ok) {
    redirect(`/admin/reviews?error=${encodeURIComponent(result.message)}` as Route);
  }
  revalidatePath("/admin/reviews");
  revalidatePath("/courses");
}

export async function refundOrderAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const orderId = String(formData.get("orderId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const result = await processAdminRefund(admin.id, orderId, reason);
  if (!result.ok) {
    redirect(`/admin/refunds?error=${encodeURIComponent(result.message)}` as Route);
  }
  revalidatePath("/admin/refunds");
  revalidatePath("/dashboard");
  revalidatePath("/orders");
}

export async function approveReviewAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const courseId = String(formData.get("courseId") ?? "");
  const result = await approveReview(admin.id, courseId);
  if (!result.ok) redirect(`/admin/courses?error=${encodeURIComponent(result.message)}` as Route);
  revalidatePath("/admin/courses");
  revalidatePath("/courses");
}

export async function returnReviewAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const courseId = String(formData.get("courseId") ?? "");
  const result = await returnReview(admin.id, courseId, String(formData.get("note") ?? ""));
  if (!result.ok) redirect(`/admin/courses?error=${encodeURIComponent(result.message)}` as Route);
  revalidatePath("/admin/courses");
}
