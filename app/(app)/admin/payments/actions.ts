"use server";

import { revalidatePath } from "next/cache";
import { approveManualPayment, rejectManualPayment } from "@/lib/payments";
import { requireRole } from "@/lib/session";

export type ReviewState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

export async function approvePayment(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const admin = await requireRole("ADMIN");
  const result = await approveManualPayment({
    paymentId: String(formData.get("paymentId") ?? ""),
    adminId: admin.id,
    notes: String(formData.get("notes") ?? ""),
  });
  revalidatePath("/admin/payments");
  return result.ok
    ? { status: "done", message: result.message }
    : { status: "error", message: result.message };
}

export async function rejectPayment(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const admin = await requireRole("ADMIN");
  const result = await rejectManualPayment({
    paymentId: String(formData.get("paymentId") ?? ""),
    adminId: admin.id,
    notes: String(formData.get("notes") ?? ""),
  });
  revalidatePath("/admin/payments");
  return result.ok
    ? { status: "done", message: result.message }
    : { status: "error", message: result.message };
}
