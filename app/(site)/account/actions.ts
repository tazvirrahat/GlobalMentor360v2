"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export type AccountState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

function authErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

export async function changePasswordAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "You need to sign in first." };

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (newPassword !== confirm) {
    return { status: "error", message: "The new passwords do not match." };
  }

  try {
    await auth.api.changePassword({
      body: { currentPassword, newPassword, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch (error) {
    return { status: "error", message: authErrorMessage(error, "Could not change password.") };
  }

  revalidatePath("/account");
  return { status: "done", message: "Password updated. Other devices were signed out." };
}

export async function changeEmailAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "You need to sign in first." };

  const newEmail = String(formData.get("newEmail") ?? "").trim();
  if (!newEmail) return { status: "error", message: "Enter the new email address." };

  try {
    await auth.api.changeEmail({
      body: { newEmail, callbackURL: "/account" },
      headers: await headers(),
    });
  } catch (error) {
    return { status: "error", message: authErrorMessage(error, "Could not start the email change.") };
  }

  return {
    status: "done",
    message:
      "Check your current inbox to confirm the new address. If it does not arrive, check spam — some addresses will not receive mail until sending is fully enabled.",
  };
}

export async function revokeSessionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const token = String(formData.get("token") ?? "");
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.session.token === token) return;

  await db.session.deleteMany({ where: { token, userId: user.id } });
  revalidatePath("/account");
}

export async function revokeOtherSessionsAction(): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "You need to sign in first." };

  try {
    await auth.api.revokeOtherSessions({ headers: await headers() });
  } catch (error) {
    return { status: "error", message: authErrorMessage(error, "Could not revoke other sessions.") };
  }

  revalidatePath("/account");
  return { status: "done", message: "Signed out of other devices." };
}
