/**
 * Course images: one per course, stored in the app bucket under
 * course-images/<courseId>/…, the key kept in Course.thumbnailUrl and served by
 * /api/course-images/<courseId>. Pure helpers only.
 */

export const COURSE_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type CourseImageType = keyof typeof COURSE_IMAGE_TYPES;

export const COURSE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export function isCourseImageType(type: string): type is CourseImageType {
  return type in COURSE_IMAGE_TYPES;
}

export function courseImageKey(courseId: string, fileId: string, type: CourseImageType): string {
  return `course-images/${courseId}/${fileId}.${COURSE_IMAGE_TYPES[type]}`;
}

/** True when a key is one of this course's images (so a client cannot point it elsewhere). */
export function isCourseImageKey(key: string, courseId: string): boolean {
  return /^course-images\/[^/]+\/[A-Za-z0-9-]+\.(jpg|png|webp)$/.test(key) && key.startsWith(`course-images/${courseId}/`);
}

/**
 * The image URL for a course, or null for the letter tile. The version is the
 * file id from the key, so a new upload is a new URL and caches never serve
 * the old picture.
 */
export function courseImageUrl(courseId: string, key: string | null | undefined): string | null {
  if (!key || !isCourseImageKey(key, courseId)) return null;
  const version = key.split("/").pop()!.split(".")[0]!.slice(0, 12);
  return `/api/course-images/${courseId}?v=${version}`;
}
