"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { grantCourse, setUserStatus } from "@/lib/admin";
import { startViewAs } from "@/lib/impersonation";
import { requireRole } from "@/lib/session";
import { VIEW_AS_COOKIE, VIEW_AS_LABEL_COOKIE } from "@/lib/view-as-cookie";

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

/**
 * Starts a read-only "view as" (features plan 16): signed grant cookie plus a
 * display-only label for the banner, both ending with the grant. Audited in
 * lib/impersonation.
 */
export async function viewAsAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const targetId = String(formData.get("userId") ?? "");
  const result = await startViewAs(admin.id, targetId);
  if (!result.ok) redirect(`/admin/users/${targetId}?error=${encodeURIComponent(result.message)}` as Route);

  const jar = await cookies();
  const common = { sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", expires: result.expiresAt };
  jar.set(VIEW_AS_COOKIE, result.cookie, { ...common, httpOnly: true });
  // Plain JSON: Next URL-encodes cookie values itself (the banner decodes once).
  jar.set(VIEW_AS_LABEL_COOKIE, JSON.stringify({ n: result.targetName, e: result.expiresAt.getTime() }), {
    ...common,
    httpOnly: false,
  });
  redirect("/dashboard");
}
