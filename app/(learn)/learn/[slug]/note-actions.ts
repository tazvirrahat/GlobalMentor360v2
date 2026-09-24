"use server";

import { revalidatePath } from "next/cache";
import { createNote, deleteNote, toggleBookmark } from "@/lib/notes";
import { getCurrentUser } from "@/lib/session";

export async function addNoteAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;

  const lectureId = String(formData.get("lectureId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const result = await createNote({
    userId: user.id,
    lectureId,
    body: String(formData.get("body") ?? ""),
    timestampSeconds: Number(formData.get("timestampSeconds") ?? 0),
  });
  if (!result.ok) return;

  revalidatePath(`/learn/${slug}/${itemId}`);
}

export async function deleteNoteAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;

  await deleteNote(user.id, String(formData.get("noteId") ?? ""));
  const slug = String(formData.get("slug") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  revalidatePath(`/learn/${slug}/${itemId}`);
}

export async function toggleBookmarkAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;

  await toggleBookmark(user.id, String(formData.get("itemId") ?? ""));
  const slug = String(formData.get("slug") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  revalidatePath(`/learn/${slug}/${itemId}`);
}
