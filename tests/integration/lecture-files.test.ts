import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Audio and PDF lectures: only the owner changes the file, a key must be in
 * the lecture's own folder, the file is handed to exactly who may open the
 * lecture, and these files stay out of Admin › Videos' counts.
 */

const hoisted = vi.hoisted(() => ({ userId: "" }));

vi.mock("@/lib/session", () => ({
  requireRole: async () => ({ id: hoisted.userId, email: "files@example.test", name: "Files" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { finishLectureFileUpload, removeLectureFile, startLectureFileUpload } = await import("@/app/(app)/studio/lecture-file-actions");
const { resolveLectureFile } = await import("@/lib/lecture-file-access");
const { videoStatusCounts } = await import("@/lib/video-jobs");
const { db } = await import("@/lib/db");
const { grantEnrollment } = await import("@/lib/enrollment");

const run = randomUUID().slice(0, 8);
let ownerId: string;
let otherId: string;
let learnerId: string;
let courseId: string;
let audioItemId: string;
let audioLectureId: string;
let pdfItemId: string;
let articleItemId: string;
const assetIds: string[] = [];

async function fileLecture(sectionId: string, position: number, kind: "AUDIO" | "FILE", isPreview: boolean) {
  const lectureKey = randomUUID();
  const item = await db.curriculumItem.create({
    data: { sectionId, title: `${kind} ${position}`, type: "LECTURE", position, isPreview, lecture: { create: { contentType: "ARTICLE", articleBody: "x" } } },
    select: { id: true, lecture: { select: { id: true } } },
  });
  const key = `lecture-files/${item.lecture!.id}/${lectureKey}/${kind === "AUDIO" ? "talk.mp3" : "notes.pdf"}`;
  const asset = await db.mediaAsset.create({ data: { provider: "file", originalKey: key, status: "READY" }, select: { id: true } });
  assetIds.push(asset.id);
  await db.lecture.update({ where: { id: item.lecture!.id }, data: { contentType: kind, assetId: asset.id } });
  return { itemId: item.id, lectureId: item.lecture!.id, key };
}

beforeAll(async () => {
  const user = async (label: string) =>
    (await db.user.create({ data: { name: `F ${label} ${run}`, email: `lf-${label}-${run}@example.test` }, select: { id: true } })).id;
  [ownerId, otherId, learnerId] = await Promise.all([user("owner"), user("other"), user("learner")]);
  courseId = (
    await db.course.create({
      data: { title: `Files ${run}`, slug: `files-${run}`, status: "PUBLISHED", publishedAt: new Date(), instructorId: ownerId },
      select: { id: true },
    })
  ).id;
  const section = await db.section.create({ data: { courseId, title: "S", position: 0 }, select: { id: true } });
  ({ itemId: audioItemId, lectureId: audioLectureId } = await fileLecture(section.id, 0, "AUDIO", false));
  ({ itemId: pdfItemId } = await fileLecture(section.id, 1, "FILE", true));
  articleItemId = (
    await db.curriculumItem.create({
      data: { sectionId: section.id, title: "Article", type: "LECTURE", position: 2, isPreview: true, lecture: { create: { contentType: "ARTICLE", articleBody: "x" } } },
      select: { id: true },
    })
  ).id;
  await grantEnrollment(learnerId, courseId, "GRANT");
});

afterAll(async () => {
  await db.analyticsEvent.deleteMany({ where: { userId: { in: [ownerId, otherId, learnerId] } } });
  await db.notification.deleteMany({ where: { userId: learnerId } });
  await db.courseProgress.deleteMany({ where: { courseId } });
  await db.enrollment.deleteMany({ where: { courseId } });
  await db.course.deleteMany({ where: { id: courseId } });
  await db.mediaAsset.deleteMany({ where: { id: { in: assetIds } } });
  await db.user.deleteMany({ where: { id: { in: [ownerId, otherId, learnerId] } } });
  await db.$disconnect();
});

describe("who gets the file", () => {
  it("gives an enrolled learner the audio, and nobody else", async () => {
    expect(await resolveLectureFile(learnerId, audioItemId)).toMatchObject({ kind: "AUDIO", filename: "talk.mp3" });
    expect(await resolveLectureFile(otherId, audioItemId)).toBeNull();
    expect(await resolveLectureFile(null, audioItemId)).toBeNull();
  });

  it("gives a free-preview PDF to anyone", async () => {
    expect(await resolveLectureFile(null, pdfItemId)).toMatchObject({ kind: "FILE", filename: "notes.pdf" });
  });

  it("is null for an article or an unknown item", async () => {
    expect(await resolveLectureFile(null, articleItemId)).toBeNull();
    expect(await resolveLectureFile(learnerId, randomUUID())).toBeNull();
  });
});

describe("studio writes", () => {
  it("says plainly that uploads need storage when it is not configured", async () => {
    hoisted.userId = ownerId;
    const result = await startLectureFileUpload({ itemId: audioItemId, filename: "a.mp3", contentType: "audio/mpeg", sizeBytes: 10 });
    expect(result.ok).toBe(false);
  });

  it("refuses to finish an upload whose key is another lecture's", async () => {
    hoisted.userId = ownerId;
    const result = await finishLectureFileUpload({ itemId: audioItemId, key: `lecture-files/${randomUUID()}/x/a.mp3` });
    expect(result).toEqual({ ok: false, message: "That upload is not for this lecture." });
  });

  it("keeps these files out of the video counts", async () => {
    const before = await videoStatusCounts();
    const extra = await db.mediaAsset.create({ data: { provider: "file", originalKey: "lecture-files/x/y/z.pdf", status: "READY" }, select: { id: true } });
    assetIds.push(extra.id);
    expect((await videoStatusCounts()).READY).toBe(before.READY);
  });

  it("lets only the owner remove the file, which turns the lecture back into an article", async () => {
    hoisted.userId = otherId;
    expect(await removeLectureFile({ itemId: audioItemId })).toEqual({ ok: false, message: "Lecture not found." });

    hoisted.userId = ownerId;
    const assetId = (await db.lecture.findUniqueOrThrow({ where: { id: audioLectureId }, select: { assetId: true } })).assetId!;
    expect(await removeLectureFile({ itemId: audioItemId })).toEqual({ ok: true });
    expect(await db.lecture.findUniqueOrThrow({ where: { id: audioLectureId }, select: { contentType: true, assetId: true } })).toEqual({
      contentType: "ARTICLE",
      assetId: null,
    });
    // Nothing else used it, so the asset row is gone too.
    expect(await db.mediaAsset.count({ where: { id: assetId } })).toBe(0);
  });
});
