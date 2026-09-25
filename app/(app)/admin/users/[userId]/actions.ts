"use server";

import { revalidatePath } from "next/cache";
import { grantCourse, setUserStatus } from "@/lib/admin";
import { requireRole } from "@/lib/session";

/** One user's admin page: Suspend / Unsuspend and Give a course. ADMIN only; lib/admin audits. */

export type UserAdminState = { status: "idle" } | { status: "error"; message: string } | { status: "done"; message: string };

export async function userStatusAction(_prev: UserAdminState, formData: FormData): Promise<UserAdminState> {
  const admin = await requireRole("ADMIN");
  const userId = String(formData.get("userId") ?? "");
  const next = formData.get("status") === "SUSPENDED" ? "SUSPENDED" : "ACTIVE";
  const result = await setUserStatus(admin.id, userId, next);
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
  return { status: "done", message: next === "SUSPENDED" ? "Suspended. They have been signed out." : "Account restored." };
}

export async function grantCourseAction(_prev: UserAdminState, formData: FormData): Promise<UserAdminState> {
  const admin = await requireRole("ADMIN");
  const userId = String(formData.get("userId") ?? "");
  const courseId = String(formData.get("courseId") ?? "");
  if (!courseId || courseId === "none") return { status: "error", message: "Pick a course." };
  const result = await grantCourse(admin.id, userId, courseId);
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath(`/admin/users/${userId}`);
  return { status: "done", message: "Course given. It's in their My learning now." };
}
