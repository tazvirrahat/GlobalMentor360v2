import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Lecture resources: studio writes are the course owner's only, and a download
 * is handed out to exactly the people who may open the lecture.
 */

const hoisted = vi.hoisted(() => ({ userId: "" }));

vi.mock("@/lib/session", () => ({
  requireRole: async () => ({ id: hoisted.userId, email: "resources@example.test", name: "Resources" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { addResourceLink, deleteResource, finishResourceUpload, startResourceUpload } = await import(
  "@/app/(app)/studio/resource-actions"
);
const { resolveResourceDownload } = await import("@/lib/resource-access");
const { db } = await import("@/lib/db");
const { grantEnrollment } = await import("@/lib/enrollment");

const run = randomUUID().slice(0, 8);
let ownerId: string;
let otherId: string;
let learnerId: string;
let courseId: string;
let lectureItemId: string;
let lectureId: string;
let previewLectureId: string;

function form(entries: Record<string, string>) {
  const f = new FormData();
  for (const [key, value] of Object.entries(entries)) f.set(key, value);
  return f;
}

beforeAll(async () => {
  const user = async (label: string) =>
    (await db.user.create({ data: { name: `R ${label} ${run}`, email: `res-${label}-${run}@example.test` }, select: { id: true } }))
      .id;
  [ownerId, otherId, learnerId] = await Promise.all([user("owner"), user("other"), user("learner")]);
  courseId = (
    await db.course.create({
      data: { title: `Res ${run}`, slug: `res-${run}`, status: "PUBLISHED", publishedAt: new Date(), instructorId: ownerId },
      select: { id: true },
    })
  ).id;
  const section = await db.section.create({ data: { courseId, title: "S", position: 0 }, select: { id: true } });
  const make = async (position: number, isPreview: boolean) => {
    const item = await db.curriculumItem.create({
      data: {
        sectionId: section.id,
        title: `L${position}`,
        type: "LECTURE",
        position,
        isPreview,
        lecture: { create: { contentType: "ARTICLE", articleBody: "x", durationSeconds: 60 } },
      },
      select: { id: true, lecture: { select: { id: true } } },
    });
    return { itemId: item.id, lectureId: item.lecture!.id };
  };
  // The gated lecture first: the player opens items in order, so a lecture
  // after an unfinished one is locked (and so are its files).
  ({ itemId: lectureItemId, lectureId } = await make(0, false));
  ({ lectureId: previewLectureId } = await make(1, true));
  await grantEnrollment(learnerId, courseId, "GRANT");
});

afterAll(async () => {
  await db.analyticsEvent.deleteMany({ where: { userId: { in: [ownerId, otherId, learnerId] } } });
  await db.notification.deleteMany({ where: { userId: learnerId } });
  await db.courseProgress.deleteMany({ where: { courseId } });
  await db.enrollment.deleteMany({ where: { courseId } });
  await db.course.deleteMany({ where: { id: courseId } });
  await db.user.deleteMany({ where: { id: { in: [ownerId, otherId, learnerId] } } });
  await db.$disconnect();
});

describe("studio resource writes", () => {
  it("lets the owner add a link and refuses anyone else", async () => {
    hoisted.userId = ownerId;
    expect((await addResourceLink({ status: "idle" }, form({ itemId: lectureItemId, title: "Docs", url: "docs.example.com" }))).status).toBe("done");

    hoisted.userId = otherId;
    expect((await addResourceLink({ status: "idle" }, form({ itemId: lectureItemId, title: "Spam", url: "spam.example.com" }))).status).toBe("error");

    const rows = await db.lectureResource.findMany({ where: { lectureId }, select: { filename: true, externalUrl: true } });
    expect(rows).toEqual([{ filename: "Docs", externalUrl: "https://docs.example.com/" }]);
  });

  it("refuses a delete by someone who does not own the course", async () => {
    const row = await db.lectureResource.findFirstOrThrow({ where: { lectureId }, select: { id: true } });
    hoisted.userId = otherId;
    expect((await deleteResource({ status: "idle" }, form({ resourceId: row.id }))).status).toBe("error");
    expect(await db.lectureResource.count({ where: { id: row.id } })).toBe(1);
  });

  it("refuses to finish an upload whose key belongs to another lecture", async () => {
    hoisted.userId = ownerId;
    const result = await finishResourceUpload({
      itemId: lectureItemId,
      key: `resources/${previewLectureId}/x/notes.pdf`,
      filename: "notes.pdf",
    });
    expect(result).toEqual({ ok: false, message: "That upload is not for this lecture." });
  });

  it("says plainly that file uploads need storage when it is not configured", async () => {
    hoisted.userId = ownerId;
    const result = await startResourceUpload({ itemId: lectureItemId, filename: "a.pdf", contentType: "application/pdf", sizeBytes: 10 });
    expect(result.ok).toBe(false);
  });
});

describe("resource downloads", () => {
  it("serves enrolled learners, not strangers", async () => {
    const row = await db.lectureResource.findFirstOrThrow({ where: { lectureId }, select: { id: true } });
    expect(await resolveResourceDownload(learnerId, row.id)).toEqual({ kind: "link", url: "https://docs.example.com/" });
    expect(await resolveResourceDownload(otherId, row.id)).toBeNull();
    expect(await resolveResourceDownload(null, row.id)).toBeNull();
  });

  it("serves a free-preview lecture's file to anyone", async () => {
    const file = await db.lectureResource.create({
      data: { lectureId: previewLectureId, filename: "slides.pdf", storageKey: `resources/${previewLectureId}/f/slides.pdf`, sizeBytes: 1234 },
      select: { id: true },
    });
    expect(await resolveResourceDownload(null, file.id)).toEqual({
      kind: "file",
      key: `resources/${previewLectureId}/f/slides.pdf`,
      filename: "slides.pdf",
    });
  });

  it("follows the order lock: a lecture after an unfinished one keeps its files", async () => {
    const later = await db.curriculumItem.create({
      data: {
        sectionId: (await db.curriculumItem.findUniqueOrThrow({ where: { id: lectureItemId }, select: { sectionId: true } })).sectionId,
        title: "Later",
        type: "LECTURE",
        position: 2,
        lecture: { create: { contentType: "ARTICLE", articleBody: "x", durationSeconds: 60 } },
      },
      select: { lecture: { select: { id: true } } },
    });
    const file = await db.lectureResource.create({
      data: { lectureId: later.lecture!.id, filename: "later.pdf", storageKey: `resources/${later.lecture!.id}/f/later.pdf`, sizeBytes: 1 },
      select: { id: true },
    });
    expect(await resolveResourceDownload(learnerId, file.id)).toBeNull();
  });

  it("is null for an unknown id", async () => {
    expect(await resolveResourceDownload(learnerId, randomUUID())).toBeNull();
  });
});
