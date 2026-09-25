"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { drainMediaConvertEventQueue, isVideoEventQueueConfigured, VideoProviderError } from "@/lib/video";
import { checkVideoAsset, retryVideoProcessing, type VideoJobResult } from "@/lib/video-jobs";

/** Admin › Videos. ADMIN only; retry is audited in lib/video-jobs. */

export type VideoJobState = { status: "idle" } | { status: "error"; message: string } | { status: "done"; message: string };

function state(result: VideoJobResult): VideoJobState {
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath("/admin/videos");
  return { status: "done", message: result.message };
}

export async function videoJobAction(_prev: VideoJobState, formData: FormData): Promise<VideoJobState> {
  const admin = await requireRole("ADMIN");
  const assetId = String(formData.get("assetId") ?? "");
  const intent = String(formData.get("intent") ?? "");
  if (intent === "retry") return state(await retryVideoProcessing(admin.id, assetId));
  if (intent === "check") return state(await checkVideoAsset(assetId));
  return { status: "error", message: "Something went wrong. Reload the page and try again." };
}

export async function drainQueueAction(_prev: VideoJobState): Promise<VideoJobState> {
  await requireRole("ADMIN");
  if (!isVideoEventQueueConfigured()) return { status: "error", message: "The event queue isn't set up on this site." };
  try {
    const applied = await drainMediaConvertEventQueue();
    revalidatePath("/admin/videos");
    return { status: "done", message: applied === 1 ? "Applied 1 event." : `Applied ${applied} events.` };
  } catch (error) {
    revalidatePath("/admin/videos");
    return { status: "error", message: error instanceof VideoProviderError ? error.message : "The queue could not be read." };
  }
}
