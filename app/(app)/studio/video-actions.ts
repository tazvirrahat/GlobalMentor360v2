"use server";

import { revalidatePath } from "next/cache";
import { attachUploadedCaption } from "@/lib/captions";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { getOwnedLectureItem } from "@/lib/studio";
import { reconcileVideoAsset } from "@/lib/video-jobs";
import { releaseOrphanedLectureAsset, video, VideoProviderError } from "@/lib/video";
import {
  abortResumableUpload,
  completeResumableUpload,
  createResumableUpload,
  listUploadedParts,
  signUploadParts,
} from "@/lib/video/aws";
import { isValidPartRequest, missingParts, planUpload, VIDEO_MAX_BYTES } from "@/lib/video/multipart";
import { mediaAssetMatchesUpload } from "@/lib/video/upload-bind";

/**
 * The studio's resumable video upload, for a lecture or a course promo:
 *
 *   1. startResumableVideoUpload → a MediaAsset row (UPLOADING) + an S3 multipart upload
 *   2. signVideoUploadParts      → part URLs; the browser PUTs each part straight to S3
 *      (resumeVideoUpload lists the parts S3 has when an upload continues)
 *   3. finishResumableVideoUpload → completes the upload, starts transcoding, attaches it
 *
 * refreshVideoStatus drains MediaConvert COMPLETE/ERROR events from SQS (AWS
 * cannot POST to localhost) then reconciles against S3. The HTTP webhook at
 * /api/video/webhook stays for when a public origin exists.
 */

export type VideoActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

function providerMessage(error: unknown, fallback: string): string {
  return error instanceof VideoProviderError ? error.message : fallback;
}

/** What an upload is for: a lecture's video, or a course's promo. */
export type VideoUploadTarget = { kind: "lecture"; itemId: string } | { kind: "promo"; courseId: string };

type Previous = { id: string; providerAssetId: string | null } | null;

type ResolvedTarget =
  | { kind: "lecture"; bindId: string; courseId: string; lectureId: string; previous: Previous }
  | { kind: "promo"; bindId: string; courseId: string; slug: string; previous: Previous };

/**
 * The target, found through its owner. `bindId` is what the asset's
 * startedForItemId holds: the item id for a lecture, "course:<id>" for a promo
 * (a plain string column, so the same bind check covers both).
 */
async function resolveTarget(userId: string, target: VideoUploadTarget): Promise<ResolvedTarget | null> {
  if (target?.kind === "lecture") {
    const item = await getOwnedLectureItem(String(target.itemId ?? ""), userId);
    if (!item?.lecture) return null;
    return {
      kind: "lecture",
      bindId: item.id,
      courseId: item.section.courseId,
      lectureId: item.lecture.id,
      previous: item.lecture.asset ? { id: item.lecture.asset.id, providerAssetId: item.lecture.asset.providerAssetId } : null,
    };
  }
  if (target?.kind === "promo") {
    const course = await db.course.findFirst({
      where: { id: String(target.courseId ?? ""), instructorId: userId },
      select: { id: true, slug: true, promoVideo: { select: { id: true, providerAssetId: true } } },
    });
    if (!course) return null;
    return { kind: "promo", bindId: `course:${course.id}`, courseId: course.id, slug: course.slug, previous: course.promoVideo };
  }
  return null;
}

function revalidateTarget(target: ResolvedTarget) {
  if (target.kind === "lecture") {
    revalidatePath(`/studio/courses/${target.courseId}/curriculum`);
  } else {
    revalidatePath(`/studio/courses/${target.courseId}`);
    revalidatePath(`/courses/${target.slug}`);
  }
}

/** An in-flight upload this user started for this target (see mediaAssetMatchesUpload). */
async function uploadingAsset(userId: string, target: ResolvedTarget, mediaAssetId: string) {
  const asset = await db.mediaAsset.findUnique({
    where: { id: String(mediaAssetId ?? "") },
    select: { id: true, providerAssetId: true, originalKey: true, status: true, createdByUserId: true, startedForItemId: true },
  });
  if (!asset?.providerAssetId || !asset.originalKey || asset.status !== "UPLOADING") return null;
  if (!mediaAssetMatchesUpload(asset, { userId, itemId: target.bindId })) return null;
  return { id: asset.id, providerAssetId: asset.providerAssetId, originalKey: asset.originalKey };
}

const NOT_FOUND = "Upload not found or already processed.";

export type StartResumableUploadResult =
  | { ok: true; mediaAssetId: string; uploadId: string; partSize: number; partCount: number }
  | { ok: false; message: string };

/**
 * Step 1 of a resumable upload: a MediaAsset (UPLOADING, bound to this user
 * and target) and an S3 multipart upload for its original.
 */
export async function startResumableVideoUpload(input: {
  target: VideoUploadTarget;
  contentType: string;
  sizeBytes: number;
}): Promise<StartResumableUploadResult> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  if (!String(input.contentType ?? "").startsWith("video/")) return { ok: false, message: "Pick a video file to upload." };
  if (!(input.sizeBytes > 0) || input.sizeBytes > VIDEO_MAX_BYTES) return { ok: false, message: "Videos can be up to 50 GB." };
  const target = await resolveTarget(user.id, input.target);
  if (!target) return { ok: false, message: "Not found." };

  try {
    const upload = await createResumableUpload(input.contentType);
    const asset = await db.mediaAsset.create({
      data: {
        provider: video.name,
        providerAssetId: upload.providerAssetId,
        originalKey: upload.originalKey,
        status: "UPLOADING",
        createdByUserId: user.id,
        startedForItemId: target.bindId,
      },
      select: { id: true },
    });
    return { ok: true, mediaAssetId: asset.id, uploadId: upload.uploadId, ...planUpload(input.sizeBytes) };
  } catch (error) {
    return { ok: false, message: providerMessage(error, "Could not start the upload.") };
  }
}

/** Presigned URLs for up to 50 parts at a time. */
export async function signVideoUploadParts(input: {
  target: VideoUploadTarget;
  mediaAssetId: string;
  uploadId: string;
  partCount: number;
  partNumbers: number[];
}): Promise<{ ok: true; urls: Record<number, string> } | { ok: false; message: string }> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const target = await resolveTarget(user.id, input.target);
  const asset = target ? await uploadingAsset(user.id, target, input.mediaAssetId) : null;
  if (!asset) return { ok: false, message: NOT_FOUND };
  if (!isValidPartRequest(input.partNumbers, Number(input.partCount))) return { ok: false, message: "Invalid request." };
  try {
    return { ok: true, urls: await signUploadParts(asset.originalKey, String(input.uploadId), input.partNumbers) };
  } catch (error) {
    return { ok: false, message: providerMessage(error, "Could not continue the upload.") };
  }
}

/** The parts S3 already has, so an interrupted upload picks up where it stopped. */
export async function resumeVideoUpload(input: {
  target: VideoUploadTarget;
  mediaAssetId: string;
  uploadId: string;
}): Promise<{ ok: true; done: number[] } | { ok: false; message: string }> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const target = await resolveTarget(user.id, input.target);
  const asset = target ? await uploadingAsset(user.id, target, input.mediaAssetId) : null;
  if (!asset) return { ok: false, message: NOT_FOUND };
  try {
    const parts = await listUploadedParts(asset.originalKey, String(input.uploadId));
    return { ok: true, done: parts.map((part) => part.partNumber) };
  } catch (error) {
    return { ok: false, message: providerMessage(error, "That upload can't be resumed. Start it again.") };
  }
}

/**
 * The last step: S3 is asked which parts it holds (the browser's word is not
 * taken), every part must be there, the upload is completed, processing
 * starts, and the video is attached to its lecture or course. The asset it
 * replaces is released once nothing else uses it.
 */
export async function finishResumableVideoUpload(input: {
  target: VideoUploadTarget;
  mediaAssetId: string;
  uploadId: string;
  partCount: number;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const target = await resolveTarget(user.id, input.target);
  const asset = target ? await uploadingAsset(user.id, target, input.mediaAssetId) : null;
  if (!target || !asset) return { ok: false, message: NOT_FOUND };

  let parts: { partNumber: number; etag: string }[];
  try {
    parts = await listUploadedParts(asset.originalKey, String(input.uploadId));
  } catch (error) {
    return { ok: false, message: providerMessage(error, "Could not check the upload.") };
  }
  if (missingParts(Number(input.partCount), parts.map((part) => part.partNumber)).length > 0) {
    return { ok: false, message: "Part of the file didn't arrive. Pick the same file again to finish the upload." };
  }

  try {
    await completeResumableUpload(asset.originalKey, String(input.uploadId), parts);
    await video.startProcessing(asset.providerAssetId);
  } catch (error) {
    const message = providerMessage(error, "Could not start processing.");
    // Surface the failure on the asset so the studio shows FAILED rather than
    // a row stuck at UPLOADING forever.
    await db.mediaAsset.update({ where: { id: asset.id }, data: { status: "FAILED", failureReason: message } });
    revalidateTarget(target);
    return { ok: false, message };
  }

  await db.$transaction([
    db.mediaAsset.update({ where: { id: asset.id }, data: { status: "PROCESSING" } }),
    target.kind === "lecture"
      ? db.lecture.update({ where: { id: target.lectureId }, data: { contentType: "VIDEO", assetId: asset.id } })
      : db.course.update({ where: { id: target.courseId }, data: { promoVideoId: asset.id } }),
  ]);
  if (target.previous && target.previous.id !== asset.id) await releaseOrphanedLectureAsset(target.previous);
  revalidateTarget(target);
  return { ok: true };
}

/** Stops an upload: S3 drops the parts and the unattached asset row goes. */
export async function cancelVideoUpload(input: {
  target: VideoUploadTarget;
  mediaAssetId: string;
  uploadId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const target = await resolveTarget(user.id, input.target);
  const asset = target ? await uploadingAsset(user.id, target, input.mediaAssetId) : null;
  if (!asset) return { ok: false, message: NOT_FOUND };
  await abortResumableUpload(asset.originalKey, String(input.uploadId));
  await db.mediaAsset.delete({ where: { id: asset.id } }).catch(() => undefined);
  return { ok: true };
}

/** Takes a course's promo off; the asset is deleted once nothing uses it. */
export async function removePromoVideo(input: { courseId: string }): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const target = await resolveTarget(user.id, { kind: "promo", courseId: input.courseId });
  if (!target) return { ok: false, message: "Course not found." };
  await db.course.update({ where: { id: target.courseId }, data: { promoVideoId: null } });
  if (target.previous) await releaseOrphanedLectureAsset(target.previous);
  revalidateTarget(target);
  return { ok: true };
}

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

  const result = await reconcileVideoAsset({
    id: asset.id,
    providerAssetId: asset.providerAssetId,
    status: asset.status,
    lectureId: item.lecture?.id ?? null,
  });
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath(`/studio/courses/${item.section.courseId}/curriculum`);
  return { status: "done", message: result.message };
}

export async function attachCaptionAction(
  _prev: VideoActionState,
  formData: FormData,
): Promise<VideoActionState> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const itemId = String(formData.get("itemId") ?? "");
  const language = String(formData.get("language") ?? "en");
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Choose a .vtt file." };
  }
  if (file.size > 1_000_000) {
    return { status: "error", message: "Caption files must be under 1 MB." };
  }

  const vtt = await file.text();
  const result = await attachUploadedCaption({
    instructorId: user.id,
    itemId,
    language,
    vtt,
  });
  if (!result.ok) return { status: "error", message: result.message };

  const item = await getOwnedLectureItem(itemId, user.id);
  if (item) revalidatePath(`/studio/courses/${item.section.courseId}/curriculum/${itemId}`);
  return { status: "done", message: `Captions attached (${language}).` };
}
