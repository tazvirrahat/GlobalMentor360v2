"use server";

import { revalidatePath } from "next/cache";
import { setCourseArchived } from "@/lib/my-learning";
import { getCurrentUser } from "@/lib/session";

/** Archive (archived=true) or unarchive a course in My learning. */
export async function archiveCourseAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  const courseId = String(formData.get("courseId") ?? "");
  const archived = String(formData.get("archived") ?? "") === "true";
  await setCourseArchived(user.id, courseId, archived);
  revalidatePath("/dashboard");
}
