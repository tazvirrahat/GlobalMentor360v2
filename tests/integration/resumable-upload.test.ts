import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Resumable video uploads: every step finds the upload through its owner and
 * target, part requests are bounded, and a promo upload cannot be finished
 * onto a lecture (or the other way round). AWS is unset in tests, so a request
 * that passes the guards stops at the provider.
 */

const hoisted = vi.hoisted(() => ({ userId: "" }));

vi.mock("@/lib/session", () => ({
  requireRole: async () => ({ id: hoisted.userId, email: "resumable@example.test", name: "Resumable" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const actions = await import("@/app/(app)/studio/video-actions");
const { db } = await import("@/lib/db");

const run = randomUUID().slice(0, 8);
let ownerId: string;
let otherId: string;
let courseId: string;
let itemId: string;
let otherItemId: string;
let lectureAssetId: string;
let promoAssetId: string;
const assetIds: string[] = [];

async function asset(bindId: string, status: "UPLOADING" | "READY" = "UPLOADING") {
  const providerAssetId = randomUUID();
  const row = await db.mediaAsset.create({
    data: {
      providerAssetId,
      originalKey: `uploads/${providerAssetId}/original`,
      status,
      createdByUserId: ownerId,
      startedForItemId: bindId,
    },
    select: { id: true },
  });
  assetIds.push(row.id);
  return row.id;
}

beforeAll(async () => {
  const user = async (label: string) =>
    (await db.user.create({ data: { name: `U ${label} ${run}`, email: `ru-${label}-${run}@example.test` }, select: { id: true } })).id;
  [ownerId, otherId] = await Promise.all([user("owner"), user("other")]);
  courseId = (await db.course.create({ data: { title: `Ru ${run}`, slug: `ru-${run}`, instructorId: ownerId }, select: { id: true } })).id;
  const section = await db.section.create({ data: { courseId, title: "S", position: 0 }, select: { id: true } });
  const item = async (position: number) =>
    (
      await db.curriculumItem.create({
        data: { sectionId: section.id, title: `L${position}`, type: "LECTURE", position, lecture: { create: { contentType: "ARTICLE" } } },
        select: { id: true },
      })
    ).id;
  itemId = await item(0);
  otherItemId = await item(1);
  lectureAssetId = await asset(itemId);
  promoAssetId = await asset(`course:${courseId}`);
});

afterAll(async () => {
  await db.course.deleteMany({ where: { id: courseId } });
  await db.mediaAsset.deleteMany({ where: { id: { in: assetIds } } });
  await db.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } });
  await db.$disconnect();
});

const lecture = () => ({ kind: "lecture" as const, itemId });
const promo = () => ({ kind: "promo" as const, courseId });

describe("starting", () => {
  it("wants a video of a sane size", async () => {
    hoisted.userId = ownerId;
    expect(await actions.startResumableVideoUpload({ target: lecture(), contentType: "application/pdf", sizeBytes: 10 })).toEqual({
      ok: false,
      message: "Pick a video file to upload.",
    });
    expect((await actions.startResumableVideoUpload({ target: lecture(), contentType: "video/mp4", sizeBytes: 0 })).ok).toBe(false);
  });

  it("refuses someone else's lecture, and stops at the provider when storage is unset", async () => {
    hoisted.userId = otherId;
    expect(await actions.startResumableVideoUpload({ target: lecture(), contentType: "video/mp4", sizeBytes: 10 })).toEqual({
      ok: false,
      message: "Not found.",
    });
    hoisted.userId = ownerId;
    const result = await actions.startResumableVideoUpload({ target: lecture(), contentType: "video/mp4", sizeBytes: 10 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/not configured/);
  });
});

describe("parts and finishing", () => {
  const sign = (target: ReturnType<typeof lecture> | ReturnType<typeof promo>, mediaAssetId: string, partNumbers: number[]) =>
    actions.signVideoUploadParts({ target, mediaAssetId, uploadId: "u", partCount: 3, partNumbers });

  it("finds the upload only through its owner and its own target", async () => {
    hoisted.userId = otherId;
    expect(await sign(lecture(), lectureAssetId, [1])).toEqual({ ok: false, message: "Upload not found or already processed." });
    hoisted.userId = ownerId;
    expect((await sign({ kind: "lecture", itemId: otherItemId }, lectureAssetId, [1])).ok).toBe(false);
    // A promo upload cannot be signed, resumed or finished as a lecture's, nor the reverse.
    expect((await sign(lecture(), promoAssetId, [1])).ok).toBe(false);
    expect((await sign(promo(), lectureAssetId, [1])).ok).toBe(false);
    expect((await actions.finishResumableVideoUpload({ target: lecture(), mediaAssetId: promoAssetId, uploadId: "u", partCount: 1 })).ok).toBe(
      false,
    );
  });

  it("bounds part requests", async () => {
    hoisted.userId = ownerId;
    expect(await sign(lecture(), lectureAssetId, [4])).toEqual({ ok: false, message: "Invalid request." });
    expect(await sign(lecture(), lectureAssetId, [1, 1])).toEqual({ ok: false, message: "Invalid request." });
  });

  it("passes the guards for the right owner and target, then stops at the provider", async () => {
    hoisted.userId = ownerId;
    const lectureSign = await sign(lecture(), lectureAssetId, [1, 2]);
    expect(lectureSign.ok).toBe(false);
    if (!lectureSign.ok) expect(lectureSign.message).toMatch(/not configured/);
    const promoResume = await actions.resumeVideoUpload({ target: promo(), mediaAssetId: promoAssetId, uploadId: "u" });
    expect(promoResume.ok).toBe(false);
    if (!promoResume.ok) expect(promoResume.message).toMatch(/not configured/);
  });

  it("lets only the owner cancel, which drops the asset row", async () => {
    hoisted.userId = otherId;
    expect((await actions.cancelVideoUpload({ target: lecture(), mediaAssetId: lectureAssetId, uploadId: "u" })).ok).toBe(false);
    hoisted.userId = ownerId;
    expect(await actions.cancelVideoUpload({ target: lecture(), mediaAssetId: lectureAssetId, uploadId: "u" })).toEqual({ ok: true });
    expect(await db.mediaAsset.count({ where: { id: lectureAssetId } })).toBe(0);
  });
});

describe("removing a promo", () => {
  it("is the owner's, and releases the asset", async () => {
    const ready = await asset(`course:${courseId}`, "READY");
    await db.course.update({ where: { id: courseId }, data: { promoVideoId: ready } });

    hoisted.userId = otherId;
    expect(await actions.removePromoVideo({ courseId })).toEqual({ ok: false, message: "Course not found." });

    hoisted.userId = ownerId;
    expect(await actions.removePromoVideo({ courseId })).toEqual({ ok: true });
    expect((await db.course.findUniqueOrThrow({ where: { id: courseId }, select: { promoVideoId: true } })).promoVideoId).toBeNull();
    expect(await db.mediaAsset.count({ where: { id: ready } })).toBe(0);
  });
});
