"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createCoupon, resolveCouponScope } from "@/lib/coupons";
import { db } from "@/lib/db";
import { hasRole, requireRole } from "@/lib/session";

export type CouponState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

const schema = z.object({
  code: z.string().trim().min(3).max(40),
  type: z.enum(["PERCENTAGE", "FIXED"]),
  value: z.coerce.number().int().positive(),
  courseId: z.string().optional(),
  maxRedemptions: z.string().optional(),
});

export async function createCouponAction(
  _prev: CouponState,
  formData: FormData,
): Promise<CouponState> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");

  const parsed = schema.safeParse({
    code: formData.get("code"),
    type: formData.get("type"),
    value: formData.get("value"),
    courseId: formData.get("courseId") ?? "",
    maxRedemptions: formData.get("maxRedemptions") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid coupon." };
  }

  const isAdmin = await hasRole(user.id, "ADMIN");
  const scope = resolveCouponScope({
    requestedCourseId: parsed.data.courseId,
    isAdmin,
  });
  if (!scope.ok) return { status: "error", message: scope.message };

  const courseId = scope.courseId;
  if (courseId) {
    const owned = await db.course.findFirst({
      where: isAdmin ? { id: courseId } : { id: courseId, instructorId: user.id },
      select: { id: true },
    });
    if (!owned) {
      return {
        status: "error",
        message: isAdmin
          ? "Course not found."
          : "You can only scope a coupon to your own course.",
      };
    }
  }

  const max =
    parsed.data.maxRedemptions && parsed.data.maxRedemptions !== ""
      ? Number(parsed.data.maxRedemptions)
      : null;
  if (max !== null && (!Number.isInteger(max) || max < 1)) {
    return { status: "error", message: "Max redemptions must be a whole number of 1 or more." };
  }

  const value =
    parsed.data.type === "FIXED" ? parsed.data.value : parsed.data.value;

  const result = await createCoupon({
    code: parsed.data.code,
    type: parsed.data.type,
    value,
    courseId,
    maxRedemptions: max,
    isAdmin,
  });
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/studio/coupons");
  return { status: "done", message: `Coupon ${parsed.data.code.toUpperCase()} created.` };
}
