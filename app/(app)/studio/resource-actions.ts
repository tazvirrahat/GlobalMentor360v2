"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  isKeyForLecture,
  parseResourceLink,
  RESOURCE_MAX_BYTES,
  RESOURCES_PER_LECTURE,
  resourceStorageKey,
  safeDownloadName,
} from "@/lib/lecture-resources";
import { requireRole } from "@/lib/session";
import { deleteObject, headObject, isStorageConfigured, presignUpload } from "@/lib/storage";
import { getOwnedLectureItem } from "@/lib/studio";

/**
 * Lecture resources from the studio. Every write finds the lecture through
 * getOwnedLectureItem, so ownership is part of the lookup. Files take two
 * steps like video: a presigned PUT target, then a finish call that checks the
 * object really landed before a row points at it.
 */

export type ResourceState = { status: "idle" } | { status: "error"; message: string } | { status: "done"; message: string };

async function ownedLecture(itemId: string) {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const item = await getOwnedLectureItem(itemId, user.id);
  if (!item?.lecture) return null;
  return { item, lectureId: item.lecture.id };
}

async function atCapacity(lectureId: string) {
  return (await db.lectureResource.count({ where: { lectureId } })) >= RESOURCES_PER_LECTURE;
}

function revalidate(courseId: string, itemId: string) {
  revalidatePath(`/studio/courses/${courseId}/curriculum/${itemId}`);
}

export async function addResourceLink(_prev: ResourceState, formData: FormData): Promise<ResourceState> {
  const owned = await ownedLecture(String(formData.get("itemId") ?? ""));
  if (!owned) return { status: "error", message: "Lecture not found." };

  const link = parseResourceLink(String(formData.get("title") ?? ""), String(formData.get("url") ?? ""));
  if (!link.ok) return { status: "error", message: link.message };
  if (await atCapacity(owned.lectureId)) {
    return { status: "error", message: `A lecture can have up to ${RESOURCES_PER_LECTURE} resources.` };
  }

  await db.lectureResource.create({
    data: {
      lectureId: owned.lectureId,
      filename: link.value.title,
      externalUrl: link.value.url,
      storageKey: "",
      sizeBytes: 0,
    },
  });
  revalidate(owned.item.section.courseId, owned.item.id);
  return { status: "done", message: "Link added." };
}

export type StartResourceUploadResult =
  | { ok: true; key: string; uploadUrl: string; uploadHeaders: Record<string, string> }
  | { ok: false; message: string };

export async function startResourceUpload(input: {
  itemId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}): Promise<StartResourceUploadResult> {
  const owned = await ownedLecture(input.itemId);
  if (!owned) return { ok: false, message: "Lecture not found." };
  if (!isStorageConfigured()) {
    return { ok: false, message: "File uploads need cloud storage, which isn't set up on this site yet." };
  }
  if (!(input.sizeBytes > 0) || input.sizeBytes > RESOURCE_MAX_BYTES) {
    return { ok: false, message: "Files can be up to 100 MB." };
  }
  if (await atCapacity(owned.lectureId)) {
    return { ok: false, message: `A lecture can have up to ${RESOURCES_PER_LECTURE} resources.` };
  }

  const key = resourceStorageKey(owned.lectureId, randomUUID(), input.filename);
  const target = await presignUpload(key, input.contentType);
  return { ok: true, key, uploadUrl: target.url, uploadHeaders: target.headers };
}

export async function finishResourceUpload(input: {
  itemId: string;
  key: string;
  filename: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const owned = await ownedLecture(input.itemId);
  if (!owned) return { ok: false, message: "Lecture not found." };
  // The key came back from the browser; it must be in this lecture's folder.
  if (!isKeyForLecture(input.key, owned.lectureId)) return { ok: false, message: "That upload is not for this lecture." };

  const head = await headObject(input.key);
  if (head === null) return { ok: false, message: "The file didn't finish uploading. Try again." };
  const size = head.size;
  if (size > RESOURCE_MAX_BYTES) {
    await deleteObject(input.key);
    return { ok: false, message: "Files can be up to 100 MB." };
  }

  await db.lectureResource.create({
    data: {
      lectureId: owned.lectureId,
      filename: safeDownloadName(input.filename),
      storageKey: input.key,
      sizeBytes: size,
    },
  });
  revalidate(owned.item.section.courseId, owned.item.id);
  return { ok: true };
}

export async function deleteResource(_prev: ResourceState, formData: FormData): Promise<ResourceState> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const resource = await db.lectureResource.findFirst({
    where: {
      id: String(formData.get("resourceId") ?? ""),
      lecture: { curriculumItem: { section: { course: { instructorId: user.id } } } },
    },
    select: {
      id: true,
      storageKey: true,
      lecture: { select: { curriculumItem: { select: { id: true, section: { select: { courseId: true } } } } } },
    },
  });
  if (!resource) return { status: "error", message: "Resource not found." };

  await db.lectureResource.delete({ where: { id: resource.id } });
  await deleteObject(resource.storageKey);
  revalidate(resource.lecture.curriculumItem.section.courseId, resource.lecture.curriculumItem.id);
  return { status: "done", message: "Removed." };
}
