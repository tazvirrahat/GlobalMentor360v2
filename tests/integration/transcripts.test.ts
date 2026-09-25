import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Attaching a caption stores its transcript cues, so the player's Transcript
 * tab reads the database, not S3. Storage is stubbed: AWS is unset in tests.
 */

vi.mock("@/lib/video", async (original) => ({
  ...(await original<typeof import("@/lib/video")>()),
  putCaptionObject: async (assetId: string, language: string) => `captions/${assetId}/${language}.vtt`,
}));

const { db } = await import("@/lib/db");
const { attachUploadedCaption, getTranscriptForAsset } = await import("@/lib/captions");

const run = randomUUID().slice(0, 8);
let instructorId: string;
let courseId: string;
let itemId: string;
let assetId: string;

const VTT = ["WEBVTT", "", "00:00:01.000 --> 00:00:03.000", "Hello there.", "", "00:00:04.000 --> 00:00:06.500", "<b>Types</b> first."].join("\n");

beforeAll(async () => {
  instructorId = (await db.user.create({ data: { name: `Tr ${run}`, email: `tr-${run}@example.test` }, select: { id: true } })).id;
  courseId = (await db.course.create({ data: { title: `Tr ${run}`, slug: `tr-${run}`, instructorId }, select: { id: true } })).id;
  const section = await db.section.create({ data: { courseId, title: "S", position: 0 }, select: { id: true } });
  assetId = (await db.mediaAsset.create({ data: { providerAssetId: `tr-${run}`, status: "READY" }, select: { id: true } })).id;
  itemId = (
    await db.curriculumItem.create({
      data: { sectionId: section.id, title: "Video", type: "LECTURE", position: 0, lecture: { create: { contentType: "VIDEO", assetId } } },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  await db.course.deleteMany({ where: { id: courseId } });
  await db.mediaAsset.deleteMany({ where: { id: assetId } });
  await db.user.deleteMany({ where: { id: instructorId } });
  await db.$disconnect();
});

describe("transcripts", () => {
  it("stores the cues when a caption is attached", async () => {
    expect(await attachUploadedCaption({ instructorId, itemId, language: "fr", vtt: VTT })).toEqual({ ok: true });
    expect(await getTranscriptForAsset(assetId)).toEqual({
      language: "fr",
      cues: [
        { start: 1, end: 3, text: "Hello there." },
        { start: 4, end: 6.5, text: "Types first." },
      ],
    });
  });

  it("prefers English when there is more than one language", async () => {
    await attachUploadedCaption({ instructorId, itemId, language: "en", vtt: VTT.replace("Hello there.", "Hi.") });
    const transcript = await getTranscriptForAsset(assetId);
    expect(transcript?.language).toBe("en");
    expect(transcript?.cues[0]?.text).toBe("Hi.");
  });

  it("replaces the cues when the caption is attached again", async () => {
    await attachUploadedCaption({ instructorId, itemId, language: "en", vtt: VTT.replace("Hello there.", "Hello again.") });
    expect((await getTranscriptForAsset(assetId))?.cues[0]?.text).toBe("Hello again.");
    expect(await db.transcript.count({ where: { assetId } })).toBe(2);
  });
});
