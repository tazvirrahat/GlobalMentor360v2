import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Announcements, driven through the real action and the real reads.
 *
 * Two properties matter more than the happy path. Authorship is scoped by
 * ownership inside the query, so an instructor cannot announce into a course
 * they do not teach. And the recipient list is the Enrollment table — a refunded
 * learner drops off it without anyone maintaining a second list, which is the
 * whole reason invariant 1 says entitlement lives there and nowhere else.
 */

const hoisted = vi.hoisted(() => ({ actorId: "" }));

vi.mock("@/lib/session", () => ({
  requireRole: async () => ({
    id: hoisted.actorId,
    email: "announce-actor@example.test",
    name: "Announce Actor",
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { publishAnnouncement } = await import("@/app/studio/announcements/actions");
const { getLearnerAnnouncements } = await import("@/lib/announcements");
const { db } = await import("@/lib/db");
const { grantEnrollment, revokeEnrollment } = await import("@/lib/enrollment");

const run = randomUUID().slice(0, 8);
let ownerId: string;
let strangerId: string;
let learnerId: string;
let refundedId: string;
let courseId: string;

function form(entries: Record<string, string>) {
  const f = new FormData();
  for (const [key, value] of Object.entries(entries)) f.set(key, value);
  return f;
}

async function makeUser(label: string) {
  return (
    await db.user.create({
      data: { name: `${label} ${run}`, email: `${label}-${run}@example.test` },
      select: { id: true },
    })
  ).id;
}

beforeAll(async () => {
  ownerId = await makeUser("announce-owner");
  strangerId = await makeUser("announce-stranger");
  learnerId = await makeUser("announce-learner");
  refundedId = await makeUser("announce-refunded");

  courseId = (
    await db.course.create({
      data: {
        title: `Announce Course ${run}`,
        slug: `announce-course-${run}`,
        status: "PUBLISHED",
        instructorId: ownerId,
        publishedAt: new Date(),
      },
      select: { id: true },
    })
  ).id;

  await grantEnrollment(learnerId, courseId, "GRANT");
  await grantEnrollment(refundedId, courseId, "PURCHASE");
  await revokeEnrollment(refundedId, courseId);
});

afterAll(async () => {
  await db.announcement.deleteMany({ where: { courseId } });
  await db.enrollment.deleteMany({ where: { courseId } });
  await db.course.deleteMany({ where: { id: courseId } });
  await db.user.deleteMany({
    where: { id: { in: [ownerId, strangerId, learnerId, refundedId] } },
  });
  await db.$disconnect();
});

beforeEach(async () => {
  await db.announcement.deleteMany({ where: { courseId } });
  hoisted.actorId = ownerId;
});

describe("publishAnnouncement", () => {
  it("sends to live enrollments only, skipping the refunded learner", async () => {
    const result = await publishAnnouncement(
      { status: "idle" },
      form({ courseId, subject: "Section 4 is live", body: "New material on generics." }),
    );

    expect(result.status).toBe("done");
    // Two learners were enrolled; one was refunded. Only one is a recipient.
    expect(result.status === "done" && result.message).toContain("1 learner");

    const stored = await db.announcement.findFirstOrThrow({ where: { courseId } });
    expect(stored.authorId).toBe(ownerId);
    expect(stored.sentAt).not.toBeNull();
  });

  it("refuses an instructor who does not teach the course", async () => {
    hoisted.actorId = strangerId;

    const result = await publishAnnouncement(
      { status: "idle" },
      form({ courseId, subject: "Not mine to announce", body: "Should not land." }),
    );

    expect(result.status).toBe("error");
    expect(await db.announcement.count({ where: { courseId } })).toBe(0);
  });

  it("rejects an empty body before it reaches the database", async () => {
    const result = await publishAnnouncement(
      { status: "idle" },
      form({ courseId, subject: "Valid subject", body: "   " }),
    );

    expect(result.status).toBe("error");
    expect(await db.announcement.count({ where: { courseId } })).toBe(0);
  });
});

describe("getLearnerAnnouncements", () => {
  beforeEach(async () => {
    hoisted.actorId = ownerId;
    await publishAnnouncement(
      { status: "idle" },
      form({ courseId, subject: "Readable", body: "Body text." }),
    );
  });

  it("shows a live enrollment the announcement", async () => {
    const rows = await getLearnerAnnouncements(learnerId, courseId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subject).toBe("Readable");
  });

  it("shows a refunded learner nothing", async () => {
    // The row still exists and the course still exists; what changed is the
    // enrollment, which is the only thing the read consults.
    expect(await getLearnerAnnouncements(refundedId, courseId)).toHaveLength(0);
  });

  it("shows someone who was never enrolled nothing", async () => {
    expect(await getLearnerAnnouncements(strangerId, courseId)).toHaveLength(0);
  });
});
