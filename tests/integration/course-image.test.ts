import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Course images: only the owner changes one, and a draft's image is shown to
 * its instructor and admins, a published course's to everyone.
 */

const hoisted = vi.hoisted(() => ({ userId: "" }));

vi.mock("@/lib/session", () => ({
  requireRole: async () => ({ id: hoisted.userId, email: "images@example.test", name: "Images" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { finishCourseImageUpload, removeCourseImage, startCourseImageUpload } = await import(
  "@/app/(app)/studio/course-image-actions"
);
const { resolveCourseImage } = await import("@/lib/course-image-access");
const { db } = await import("@/lib/db");

const run = randomUUID().slice(0, 8);
let ownerId: string;
let otherId: string;
let adminId: string;
let courseId: string;
let key: string;

beforeAll(async () => {
  const user = async (label: string) =>
    (await db.user.create({ data: { name: `I ${label} ${run}`, email: `img-${label}-${run}@example.test` }, select: { id: true } }))
      .id;
  [ownerId, otherId, adminId] = await Promise.all([user("owner"), user("other"), user("admin")]);
  await db.userRole.create({ data: { userId: adminId, role: "ADMIN" } });
  courseId = (
    await db.course.create({
      data: { title: `Img ${run}`, slug: `img-${run}`, instructorId: ownerId },
      select: { id: true },
    })
  ).id;
  key = `course-images/${courseId}/${randomUUID()}.png`;
  await db.course.update({ where: { id: courseId }, data: { thumbnailUrl: key } });
});

afterAll(async () => {
  await db.course.deleteMany({ where: { id: courseId } });
  await db.userRole.deleteMany({ where: { userId: adminId } });
  await db.user.deleteMany({ where: { id: { in: [ownerId, otherId, adminId] } } });
  await db.$disconnect();
});

describe("who sees a course image", () => {
  it("shows a draft's image to its instructor and admins only", async () => {
    expect(await resolveCourseImage(ownerId, courseId)).toEqual({ key, isPublic: false });
    expect(await resolveCourseImage(adminId, courseId)).toEqual({ key, isPublic: false });
    expect(await resolveCourseImage(otherId, courseId)).toBeNull();
    expect(await resolveCourseImage(null, courseId)).toBeNull();
  });

  it("shows a published course's image to everyone, cacheably", async () => {
    await db.course.update({ where: { id: courseId }, data: { status: "PUBLISHED", publishedAt: new Date() } });
    expect(await resolveCourseImage(null, courseId)).toEqual({ key, isPublic: true });
  });

  it("ignores a value that is not one of this course's image keys", async () => {
    await db.course.update({ where: { id: courseId }, data: { thumbnailUrl: "https://example.com/cover.png" } });
    expect(await resolveCourseImage(null, courseId)).toBeNull();
    await db.course.update({ where: { id: courseId }, data: { thumbnailUrl: key } });
  });
});

describe("studio image writes", () => {
  it("refuses to finish an upload whose key is another course's", async () => {
    hoisted.userId = ownerId;
    const result = await finishCourseImageUpload({ courseId, key: `course-images/${randomUUID()}/abc.png` });
    expect(result).toEqual({ ok: false, message: "That upload is not for this course." });
  });

  it("says plainly that uploads need storage when it is not configured", async () => {
    hoisted.userId = ownerId;
    const result = await startCourseImageUpload({ courseId, contentType: "image/png", sizeBytes: 10 });
    expect(result.ok).toBe(false);
  });

  it("lets only the owner remove the image", async () => {
    hoisted.userId = otherId;
    expect(await removeCourseImage({ courseId })).toEqual({ ok: false, message: "Course not found." });
    expect((await db.course.findUniqueOrThrow({ where: { id: courseId }, select: { thumbnailUrl: true } })).thumbnailUrl).toBe(key);

    hoisted.userId = ownerId;
    expect(await removeCourseImage({ courseId })).toEqual({ ok: true });
    expect((await db.course.findUniqueOrThrow({ where: { id: courseId }, select: { thumbnailUrl: true } })).thumbnailUrl).toBeNull();
  });
});
