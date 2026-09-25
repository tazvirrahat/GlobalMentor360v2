"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  COURSE_IMAGE_MAX_BYTES,
  courseImageKey,
  isCourseImageKey,
  isCourseImageType,
} from "@/lib/course-image";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { deleteObject, headObject, isStorageConfigured, presignUpload } from "@/lib/storage";

/**
 * A course's image from the Details tab. Two steps like resources: a presigned
 * PUT under course-images/<courseId>/, then a finish call that checks the
 * object landed (size and type) before thumbnailUrl points at it. Every call
 * finds the course by id and owner together.
 */

type Result = { ok: true } | { ok: false; message: string };

const TOO_BIG = "Images can be up to 5 MB.";
const WRONG_TYPE = "Use a JPEG, PNG or WebP image.";

async function ownedCourse(courseId: string) {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  return db.course.findFirst({
    where: { id: courseId, instructorId: user.id },
    select: { id: true, slug: true, thumbnailUrl: true },
  });
}

function revalidate(course: { id: string; slug: string }) {
  revalidatePath(`/studio/courses/${course.id}`);
  revalidatePath(`/courses/${course.slug}`);
}

export async function startCourseImageUpload(input: {
  courseId: string;
  contentType: string;
  sizeBytes: number;
}): Promise<{ ok: true; key: string; uploadUrl: string; uploadHeaders: Record<string, string> } | { ok: false; message: string }> {
  const course = await ownedCourse(input.courseId);
  if (!course) return { ok: false, message: "Course not found." };
  if (!isStorageConfigured()) {
    return { ok: false, message: "Image uploads need cloud storage, which isn't set up on this site yet." };
  }
  if (!isCourseImageType(input.contentType)) return { ok: false, message: WRONG_TYPE };
  if (!(input.sizeBytes > 0) || input.sizeBytes > COURSE_IMAGE_MAX_BYTES) return { ok: false, message: TOO_BIG };

  const key = courseImageKey(course.id, randomUUID(), input.contentType);
  const target = await presignUpload(key, input.contentType);
  return { ok: true, key, uploadUrl: target.url, uploadHeaders: target.headers };
}

export async function finishCourseImageUpload(input: { courseId: string; key: string }): Promise<Result> {
  const course = await ownedCourse(input.courseId);
  if (!course) return { ok: false, message: "Course not found." };
  // The key came back from the browser; it must be in this course's folder.
  if (!isCourseImageKey(input.key, course.id)) return { ok: false, message: "That upload is not for this course." };

  const head = await headObject(input.key);
  if (head === null) return { ok: false, message: "The image didn't finish uploading. Try again." };
  if (head.size > COURSE_IMAGE_MAX_BYTES || !head.contentType || !isCourseImageType(head.contentType)) {
    await deleteObject(input.key);
    return { ok: false, message: head.size > COURSE_IMAGE_MAX_BYTES ? TOO_BIG : WRONG_TYPE };
  }

  await db.course.update({ where: { id: course.id }, data: { thumbnailUrl: input.key } });
  if (course.thumbnailUrl && course.thumbnailUrl !== input.key && isCourseImageKey(course.thumbnailUrl, course.id)) {
    await deleteObject(course.thumbnailUrl);
  }
  revalidate(course);
  return { ok: true };
}

export async function removeCourseImage(input: { courseId: string }): Promise<Result> {
  const course = await ownedCourse(input.courseId);
  if (!course) return { ok: false, message: "Course not found." };

  await db.course.update({ where: { id: course.id }, data: { thumbnailUrl: null } });
  if (course.thumbnailUrl && isCourseImageKey(course.thumbnailUrl, course.id)) await deleteObject(course.thumbnailUrl);
  revalidate(course);
  return { ok: true };
}
