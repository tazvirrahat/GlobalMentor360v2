"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { getOwnedLectureItem } from "@/lib/studio";
import { video, VideoProviderError } from "@/lib/video";

/**
 * The studio upload flow, in three steps the client drives:
 *
 *   1. startVideoUpload   → presigned PUT target + a MediaAsset row (UPLOADING)
 *   2. (browser PUTs the file straight to S3 — no bytes through this server)
 *   3. finalizeVideoUpload → kicks off transcoding, attaches asset to lecture
 *
 * refreshVideoStatus reconciles against the provider on demand, because in dev
 * the EventBridge webhook usually isn't wired up.
 */

export type VideoActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

export type StartVideoUploadResult =
  | {
      ok: true;
      mediaAssetId: string;
      uploadUrl: string;
      uploadHeaders: Record<string, string>;
    }
  | { ok: false; message: string };

export type FinalizeVideoUploadResult = { ok: true } | { ok: false; message: string };

function providerMessage(error: unknown, fallback: string): string {
  return error instanceof VideoProviderError ? error.message : fallback;
}

const startUploadSchema = z.object({
  itemId: z.string().min(1),
  fileName: z.string().min(1),
  contentType: z.string().startsWith("video/", "Pick a video file."),
});

export async function startVideoUpload(input: {
  itemId: string;
  fileName: string;
  contentType: string;
}): Promise<StartVideoUploadResult> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");

  const parsed = startUploadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Pick a video file to upload." };
  }

  const item = await getOwnedLectureItem(parsed.data.itemId, user.id);
  if (!item?.lecture) return { ok: false, message: "Lecture not found." };

  try {
    const upload = await video.createUpload({
      title: item.title,
      contentType: parsed.data.contentType,
    });

    const asset = await db.mediaAsset.create({
      data: {
        provider: video.name,
        providerAssetId: upload.providerAssetId,
        originalKey: upload.originalKey,
        status: "UPLOADING",
      },
      select: { id: true },
    });

    return {
      ok: true,
      mediaAssetId: asset.id,
      uploadUrl: upload.uploadUrl,
      uploadHeaders: upload.uploadHeaders,
    };
  } catch (error) {
    return { ok: false, message: providerMessage(error, "Could not start the upload.") };
  }
}

const finalizeSchema = z.object({
  itemId: z.string().min(1),
  mediaAssetId: z.string().min(1),
});

export async function finalizeVideoUpload(input: {
  itemId: string;
  mediaAssetId: string;
}): Promise<FinalizeVideoUploadResult> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");

  const parsed = finalizeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };

  const item = await getOwnedLectureItem(parsed.data.itemId, user.id);
  if (!item?.lecture) return { ok: false, message: "Lecture not found." };

  const asset = await db.mediaAsset.findUnique({
    where: { id: parsed.data.mediaAssetId },
    select: { id: true, providerAssetId: true, status: true },
  });

  // Only a fresh UPLOADING asset can be finalized — prevents re-attaching an
  // asset that already belongs to another lecture's pipeline run.
  if (!asset?.providerAssetId || asset.status !== "UPLOADING") {
    return { ok: false, message: "Upload not found or already processed." };
  }

  try {
    await video.startProcessing(asset.providerAssetId);
  } catch (error) {
    const message = providerMessage(error, "Could not start transcoding.");
    // Surface the failure on the asset so the curriculum UI shows FAILED
    // rather than a row stuck at UPLOADING forever.
    await db.mediaAsset.update({
      where: { id: asset.id },
      data: { status: "FAILED", failureReason: message },
    });
    revalidatePath(`/studio/courses/${item.section.courseId}/curriculum`);
    return { ok: false, message };
  }

  await db.$transaction([
    db.mediaAsset.update({ where: { id: asset.id }, data: { status: "PROCESSING" } }),
    db.lecture.update({
      where: { id: item.lecture.id },
      data: { contentType: "VIDEO", assetId: asset.id },
    }),
  ]);

  revalidatePath(`/studio/courses/${item.section.courseId}/curriculum`);
  return { ok: true };
}

/** Form action for the "Check status" button — reconciles a row from the provider. */
export async function refreshVideoStatus(
  _prev: VideoActionState,
  formData: FormData,
): Promise<VideoActionState> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const itemId = String(formData.get("itemId") ?? "");

  const item = await getOwnedLectureItem(itemId, user.id);
  const asset = item?.lecture?.asset;
  if (!item || !asset?.providerAssetId) {
    return { status: "error", message: "No video on this lecture yet." };
  }

  let remote;
  try {
    remote = await video.getAsset(asset.providerAssetId);
  } catch (error) {
    return { status: "error", message: providerMessage(error, "Could not reach the video provider.") };
  }

  // S3 reconciliation can't observe FAILED (only the webhook can), so never
  // let a refresh overwrite a FAILED row with PROCESSING.
  if (asset.status === "FAILED" && remote.status !== "READY") {
    return { status: "done", message: "Video failed — re-upload to try again." };
  }

  await db.mediaAsset.update({
    where: { id: asset.id },
    data: {
      status: remote.status,
      ...(remote.durationSeconds !== null ? { durationSeconds: remote.durationSeconds } : {}),
      ...(remote.thumbnailUrl !== null ? { thumbnailUrl: remote.thumbnailUrl } : {}),
      failureReason: remote.failureReason,
    },
  });

  if (remote.status === "READY" && remote.durationSeconds !== null && item.lecture) {
    await db.lecture.update({
      where: { id: item.lecture.id },
      data: { durationSeconds: remote.durationSeconds },
    });
  }

  revalidatePath(`/studio/courses/${item.section.courseId}/curriculum`);

  const message =
    remote.status === "READY"
      ? "Video is ready."
      : remote.status === "PROCESSING"
        ? "Still transcoding — check again in a minute."
        : remote.status === "FAILED"
          ? "Transcoding failed."
          : "Waiting for the upload to finish.";

  return { status: "done", message };
}
