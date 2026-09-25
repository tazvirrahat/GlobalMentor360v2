import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** A course's promo video: everyone once published; before that, its instructor and admins. */

const { db } = await import("@/lib/db");
const { resolvePromoVideo } = await import("@/lib/promo");

const run = randomUUID().slice(0, 8);
let ownerId: string;
let otherId: string;
let adminId: string;
let courseId: string;
let assetId: string;

beforeAll(async () => {
  const user = async (label: string) =>
    (await db.user.create({ data: { name: `P ${label} ${run}`, email: `promo-${label}-${run}@example.test` }, select: { id: true } })).id;
  [ownerId, otherId, adminId] = await Promise.all([user("owner"), user("other"), user("admin")]);
  await db.userRole.create({ data: { userId: adminId, role: "ADMIN" } });
  assetId = (await db.mediaAsset.create({ data: { providerAssetId: `promo-${run}`, status: "PROCESSING" }, select: { id: true } })).id;
  courseId = (
    await db.course.create({ data: { title: `Promo ${run}`, slug: `promo-${run}`, instructorId: ownerId, promoVideoId: assetId }, select: { id: true } })
  ).id;
});

afterAll(async () => {
  await db.course.deleteMany({ where: { id: courseId } });
  await db.mediaAsset.deleteMany({ where: { id: assetId } });
  await db.userRole.deleteMany({ where: { userId: adminId } });
  await db.user.deleteMany({ where: { id: { in: [ownerId, otherId, adminId] } } });
  await db.$disconnect();
});

describe("resolvePromoVideo", () => {
  it("is nothing until the video is ready", async () => {
    expect(await resolvePromoVideo(ownerId, courseId)).toBeNull();
    await db.mediaAsset.update({ where: { id: assetId }, data: { status: "READY" } });
  });

  it("shows a draft's promo to its instructor and admins only", async () => {
    expect(await resolvePromoVideo(ownerId, courseId)).toEqual({ assetId, providerAssetId: `promo-${run}` });
    expect(await resolvePromoVideo(adminId, courseId)).not.toBeNull();
    expect(await resolvePromoVideo(otherId, courseId)).toBeNull();
    expect(await resolvePromoVideo(null, courseId)).toBeNull();
  });

  it("shows a published course's promo to everyone", async () => {
    await db.course.update({ where: { id: courseId }, data: { status: "PUBLISHED", publishedAt: new Date() } });
    expect(await resolvePromoVideo(null, courseId)).not.toBeNull();
  });
});
