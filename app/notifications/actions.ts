"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/notifications";
import { getCurrentUser } from "@/lib/session";
import { safeReturnPath } from "@/lib/urls";

function revalidateNotificationViews() {
  revalidatePath("/");
  revalidatePath("/notifications");
}

export async function markOneRead(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  await markNotificationRead(user.id, String(formData.get("notificationId") ?? ""));
  revalidateNotificationViews();
}

export async function markAllRead() {
  const user = await getCurrentUser();
  if (!user) return;
  await markAllNotificationsRead(user.id);
  revalidateNotificationViews();
}

export async function openNotification(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  await markNotificationRead(user.id, String(formData.get("notificationId") ?? ""));
  revalidateNotificationViews();
  const href = safeReturnPath(String(formData.get("href") ?? "")) ?? "/notifications";
  redirect(href as Route);
}
