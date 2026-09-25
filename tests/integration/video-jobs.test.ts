import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Admin › Videos: status counts, which assets need a person (failed, or idle
 * for over an hour), and the guards on retry. AWS is unset in tests, so a
 * retry that passes the guards stops at the provider and changes nothing.
 */

const { db } = await import("@/lib/db");
const { listVideoJobsNeedingAttention, retryVideoProcessing, videoStatusCounts } = await import("@/lib/video-jobs");

const run = randomUUID().slice(0, 8);
const NOW = new Date();
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 60 * 60 * 1000);
let adminId: string;
let courseId: string;
const assets: Record<string, string> = {};

async function asset(label: string, data: { status: "UPLOADING" | "PROCESSING" | "READY" | "FAILED"; updatedAt: Date; providerAssetId?: string | null; failureReason?: string }) {
  const row = await db.mediaAsset.create({
    data: { providerAssetId: data.providerAssetId === undefined ? `vj-${label}-${run}` : data.providerAssetId, status: data.status, failureReason: data.failureReason },
    select: { id: true },
  });
  // @updatedAt would stamp "now"; set the age directly.
  await db.$executeRaw`UPDATE media_assets SET "updatedAt" = ${data.updatedAt} WHERE id = ${row.id}`;
  assets[label] = row.id;
  return row.id;
}

beforeAll(async () => {
  adminId = (await db.user.create({ data: { name: `VJ ${run}`, email: `vj-${run}@example.test` }, select: { id: true } })).id;
  courseId = (
    await db.course.create({ data: { title: `VJ course ${run}`, slug: `vj-${run}`, instructorId: adminId }, select: { id: true } })
  ).id;
  const section = await db.section.create({ data: { courseId, title: "S", position: 0 }, select: { id: true } });

  const failed = await asset("failed", { status: "FAILED", updatedAt: hoursAgo(0), failureReason: "Unsupported codec" });
  await asset("stuck", { status: "PROCESSING", updatedAt: hoursAgo(2) });
  await asset("busy", { status: "PROCESSING", updatedAt: hoursAgo(0) });
  await asset("abandoned", { status: "UPLOADING", updatedAt: hoursAgo(3) });
  await asset("ready", { status: "READY", updatedAt: hoursAgo(5) });
  await asset("never-uploaded", { status: "FAILED", updatedAt: hoursAgo(0), providerAssetId: null });

  await db.curriculumItem.create({
    data: {
      sectionId: section.id,
      title: `Codecs ${run}`,
      type: "LECTURE",
      position: 0,
      lecture: { create: { contentType: "VIDEO", assetId: failed } },
    },
  });
});

afterAll(async () => {
  await db.course.deleteMany({ where: { id: courseId } });
  await db.mediaAsset.deleteMany({ where: { id: { in: Object.values(assets) } } });
  await db.auditLog.deleteMany({ where: { actorId: adminId } });
  await db.user.deleteMany({ where: { id: adminId } });
  await db.$disconnect();
});

describe("videoStatusCounts", () => {
  it("counts every state", async () => {
    const counts = await videoStatusCounts();
    expect(counts.FAILED).toBeGreaterThanOrEqual(2);
    expect(counts.PROCESSING).toBeGreaterThanOrEqual(2);
    expect(counts.UPLOADING).toBeGreaterThanOrEqual(1);
    expect(counts.READY).toBeGreaterThanOrEqual(1);
  });
});

describe("listVideoJobsNeedingAttention", () => {
  it("lists failed and long-idle assets, not busy or ready ones", async () => {
    const ids = (await listVideoJobsNeedingAttention(NOW)).map((job) => job.id);
    expect(ids).toEqual(expect.arrayContaining([assets.failed, assets.stuck, assets.abandoned, assets["never-uploaded"]]));
    expect(ids).not.toContain(assets.busy);
    expect(ids).not.toContain(assets.ready);
  });

  it("names the lecture, course and instructor, and keeps the failure reason", async () => {
    const job = (await listVideoJobsNeedingAttention(NOW)).find((row) => row.id === assets.failed);
    expect(job?.failureReason).toBe("Unsupported codec");
    expect(job?.lecture).toMatchObject({ title: `Codecs ${run}`, courseId, courseTitle: `VJ course ${run}`, instructorName: `VJ ${run}` });
  });
});

describe("retryVideoProcessing", () => {
  it("only retries a failed video", async () => {
    expect(await retryVideoProcessing(adminId, assets.ready!)).toEqual({ ok: false, message: "Only a failed video can be retried." });
  });

  it("refuses an upload that never reached storage", async () => {
    const result = await retryVideoProcessing(adminId, assets["never-uploaded"]!);
    expect(result.ok).toBe(false);
  });

  it("stops at the provider when video processing is not configured, changing nothing", async () => {
    const result = await retryVideoProcessing(adminId, assets.failed!);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/not configured/);
    const row = await db.mediaAsset.findUniqueOrThrow({ where: { id: assets.failed }, select: { status: true } });
    expect(row.status).toBe("FAILED");
    expect(await db.auditLog.count({ where: { actorId: adminId, action: "video.retry" } })).toBe(0);
  });
});
