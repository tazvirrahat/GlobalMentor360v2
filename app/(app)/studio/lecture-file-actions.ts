"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  audioSeconds,
  isLectureFileKey,
  LECTURE_FILE_MAX_BYTES,
  LECTURE_FILE_PROVIDER,
  lectureFileKey,
  lectureFileKind,
  lectureFileLimitText,
} from "@/lib/lecture-files";
import { requireRole } from "@/lib/session";
import { deleteObject, headObject, isStorageConfigured, presignUpload } from "@/lib/storage";
import { getOwnedLectureItem } from "@/lib/studio";
import { releaseOrphanedLectureAsset } from "@/lib/video";

/**
 * Audio and PDF lectures from the lecture editor. Two steps like resources: a
 * presigned PUT under lecture-files/<lectureId>/, then a finish call that
 * checks the object landed (size and type) before the lecture points at it.
 * The file is held by a MediaAsset with provider "file"; a lecture's previous
 * asset (a video, or an earlier file) is released once nothing else uses it.
 */

type Result = { ok: true } | { ok: false; message: string };

const WRONG_TYPE = "Use an audio file (MP3, M4A, AAC, OGG, WAV) or a PDF.";

async function ownedLecture(itemId: string) {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const item = await getOwnedLectureItem(itemId, user.id);
  if (!item?.lecture) return null;
  return { user, item, lecture: item.lecture };
}

function revalidate(courseId: string, itemId: string) {
  revalidatePath(`/studio/courses/${courseId}/curriculum`);
  revalidatePath(`/studio/courses/${courseId}/curriculum/${itemId}`);
}

export async function startLectureFileUpload(input: {
  itemId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}): Promise<{ ok: true; key: string; uploadUrl: string; uploadHeaders: Record<string, string> } | { ok: false; message: string }> {
  const owned = await ownedLecture(input.itemId);
  if (!owned) return { ok: false, message: "Lecture not found." };
  if (!isStorageConfigured()) {
    return { ok: false, message: "File uploads need cloud storage, which isn't set up on this site yet." };
  }
  const kind = lectureFileKind(input.contentType);
  if (!kind) return { ok: false, message: WRONG_TYPE };
  if (!(input.sizeBytes > 0) || input.sizeBytes > LECTURE_FILE_MAX_BYTES[kind]) {
    return { ok: false, message: lectureFileLimitText(kind) };
  }

  const key = lectureFileKey(owned.lecture.id, randomUUID(), input.filename);
  const target = await presignUpload(key, input.contentType);
  return { ok: true, key, uploadUrl: target.url, uploadHeaders: target.headers };
}

export async function finishLectureFileUpload(input: { itemId: string; key: string; durationSeconds?: number }): Promise<Result> {
  const owned = await ownedLecture(input.itemId);
  if (!owned) return { ok: false, message: "Lecture not found." };
  // The key came back from the browser; it must be in this lecture's folder.
  if (!isLectureFileKey(input.key, owned.lecture.id)) return { ok: false, message: "That upload is not for this lecture." };

  const head = await headObject(input.key);
  if (head === null) return { ok: false, message: "The file didn't finish uploading. Try again." };
  const kind = head.contentType ? lectureFileKind(head.contentType) : null;
  if (!kind || head.size > LECTURE_FILE_MAX_BYTES[kind]) {
    await deleteObject(input.key);
    return { ok: false, message: kind ? lectureFileLimitText(kind) : WRONG_TYPE };
  }

  const seconds = kind === "AUDIO" ? audioSeconds(input.durationSeconds) : 0;
  const asset = await db.mediaAsset.create({
    data: {
      provider: LECTURE_FILE_PROVIDER,
      originalKey: input.key,
      status: "READY",
      durationSeconds: seconds || null,
      createdByUserId: owned.user.id,
      startedForItemId: owned.item.id,
    },
    select: { id: true },
  });
  await db.lecture.update({
    where: { id: owned.lecture.id },
    // An audio lecture's length counts toward the course's; a PDF keeps what it had.
    data: { contentType: kind, assetId: asset.id, ...(kind === "AUDIO" && seconds ? { durationSeconds: seconds } : {}) },
  });

  const previous = owned.lecture.asset;
  if (previous && previous.id !== asset.id) {
    await releaseOrphanedLectureAsset({ id: previous.id, providerAssetId: previous.providerAssetId });
  }
  revalidate(owned.item.section.courseId, owned.item.id);
  return { ok: true };
}

/** Back to an article: the lecture keeps its text, and the file is deleted once nothing uses it. */
export async function removeLectureFile(input: { itemId: string }): Promise<Result> {
  const owned = await ownedLecture(input.itemId);
  if (!owned) return { ok: false, message: "Lecture not found." };
  if (owned.lecture.contentType !== "AUDIO" && owned.lecture.contentType !== "FILE") {
    return { ok: false, message: "This lecture has no audio or PDF." };
  }
  await db.lecture.update({ where: { id: owned.lecture.id }, data: { contentType: "ARTICLE", assetId: null } });
  const previous = owned.lecture.asset;
  if (previous) await releaseOrphanedLectureAsset({ id: previous.id, providerAssetId: previous.providerAssetId });
  revalidate(owned.item.section.courseId, owned.item.id);
  return { ok: true };
}
