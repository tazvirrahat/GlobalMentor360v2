"use server";

import { revalidatePath } from "next/cache";
import { createNote, deleteNote, toggleBookmark } from "@/lib/notes";
import { parseClock } from "@/lib/player";
import { getCurrentUser } from "@/lib/session";

export type NoteFormState =
  | { status: "idle" }
  | { status: "saved"; at: number }
  | { status: "error"; message: string; field?: "body" | "at" };

/**
 * The player's note form: the body plus "At (m:ss)". Parses the time here so
 * a typo ("1:75") is reported instead of silently saved as 0.
 */
export async function saveNoteAction(_prev: NoteFormState, formData: FormData): Promise<NoteFormState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Sign in to take notes." };

  const at = parseClock(String(formData.get("at") ?? ""));
  if (at === null) {
    return { status: "error", field: "at", message: "Write the time as minutes and seconds, like 1:15." };
  }

  const lectureId = String(formData.get("lectureId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const result = await createNote({
    userId: user.id,
    lectureId,
    body: String(formData.get("body") ?? ""),
    timestampSeconds: at,
  });
  if (!result.ok) return { status: "error", field: "body", message: result.message };

  revalidatePath(`/learn/${slug}/${itemId}`);
  return { status: "saved", at };
}

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
