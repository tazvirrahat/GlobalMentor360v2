"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { parseProfileInput } from "@/lib/instructor-profile";
import { ensureInstructorSlug } from "@/lib/instructors";
import { requireRole } from "@/lib/session";

export type ProfileState =
  | { status: "idle" }
  | { status: "error"; field?: "headline" | "bio" | "websiteUrl"; message: string }
  | { status: "done"; message: string };

/** Saves the signed-in instructor's own profile; nobody else's is reachable from here. */
export async function updateInstructorProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const parsed = parseProfileInput({
    headline: String(formData.get("headline") ?? ""),
    bio: String(formData.get("bio") ?? ""),
    websiteUrl: String(formData.get("websiteUrl") ?? ""),
    profilePublic: formData.get("profilePublic") === "on",
  });
  if (!parsed.ok) return { status: "error", field: parsed.field, message: parsed.message };

  await db.user.update({ where: { id: user.id }, data: parsed.value });
  const slug = await ensureInstructorSlug(user.id);

  revalidatePath("/studio/profile");
  revalidatePath(`/instructors/${slug}`);
  return { status: "done", message: "Profile saved." };
}
