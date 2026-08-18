import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { grantEnrollment } from "@/lib/enrollment";
import {
  getCertificateBySerial,
  issueCertificate,
  issueCertificateIfComplete,
} from "@/lib/certificates";
import { markLectureComplete, recomputeCourseProgress } from "@/lib/progress";
import { GET as getCertificatePdf } from "@/app/certificates/[serial]/pdf/route";

const SERIAL = /^GM360-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/;

const run = randomUUID().slice(0, 8);
let instructorId: string;
let learnerId: string;
let courseId: string;
let lectureItemId: string;

beforeAll(async () => {
  instructorId = (
    await db.user.create({
      data: { name: `Cert Instructor ${run}`, email: `cert-instr-${run}@example.test` },
      select: { id: true },
    })
  ).id;
  learnerId = (
    await db.user.create({
      data: { name: `Cert Learner ${run}`, email: `cert-learner-${run}@example.test` },
      select: { id: true },
    })
  ).id;

  const course = await db.course.create({
    data: {
      title: `Cert Course ${run}`,
      slug: `cert-course-${run}`,
      status: "PUBLISHED",
      instructorId,
      publishedAt: new Date(),
      sections: {
        create: {
          title: "One",
          position: 0,
          items: {
            create: {
              type: "LECTURE",
              title: "The lecture",
              position: 0,
              lecture: {
                create: { contentType: "ARTICLE", articleBody: "Done.", durationSeconds: 60 },
              },
            },
          },
        },
      },
    },
    select: { id: true, sections: { select: { items: { select: { id: true } } } } },
  });
  courseId = course.id;
  lectureItemId = course.sections[0]!.items[0]!.id;

  await grantEnrollment(learnerId, courseId, "GRANT");
});

afterAll(async () => {
  await db.certificate.deleteMany({ where: { courseId } });
  await db.itemProgress.deleteMany({ where: { userId: learnerId } });
  await db.courseProgress.deleteMany({ where: { userId: learnerId } });
  await db.analyticsEvent.deleteMany({ where: { userId: learnerId } });
  await db.notification.deleteMany({ where: { userId: learnerId } });
  await db.enrollment.deleteMany({ where: { courseId } });
  await db.course.deleteMany({ where: { id: courseId } });
  await db.user.deleteMany({ where: { id: { in: [learnerId, instructorId] } } });
  await db.$disconnect();
});

describe("issue on 100% completion", () => {
  it("issues exactly once at 100%, and a second recompute keeps the same serial", async () => {
    const before = await issueCertificateIfComplete(learnerId, courseId);
    expect(before).toBeNull();

    const marked = await markLectureComplete(learnerId, lectureItemId);
    expect(marked.ok).toBe(true);

    const first = await db.certificate.findUniqueOrThrow({
      where: { userId_courseId: { userId: learnerId, courseId } },
    });
    expect(first.serial).toMatch(SERIAL);

    await recomputeCourseProgress(learnerId, courseId);
    const again = await issueCertificate(learnerId, courseId);
    expect(again.serial).toBe(first.serial);
    expect(await db.certificate.count({ where: { userId: learnerId, courseId } })).toBe(1);
  });
});

async function ensureIssued() {
  const existing = await db.certificate.findUnique({
    where: { userId_courseId: { userId: learnerId, courseId } },
  });
  if (existing) return existing;
  await markLectureComplete(learnerId, lectureItemId);
  return db.certificate.findUniqueOrThrow({
    where: { userId_courseId: { userId: learnerId, courseId } },
  });
}

describe("public verification", () => {
  it("looks up a real serial and returns nothing for an unknown one", async () => {
    const row = await ensureIssued();

    const found = await getCertificateBySerial(row.serial);
    expect(found?.user.name).toBe(`Cert Learner ${run}`);
    expect(found?.course.title).toBe(`Cert Course ${run}`);
    expect(found?.serial).toBe(row.serial);

    expect(await getCertificateBySerial("GM360-DEAD-BEEF-DEAD-BEEF")).toBeNull();
  });
});

describe("PDF route", () => {
  it("returns PDF bytes for an existing certificate", async () => {
    const row = await ensureIssued();

    const response = await getCertificatePdf(new Request("http://localhost/certificates/x/pdf"), {
      params: Promise.resolve({ serial: row.serial }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
    expect(bytes.includes(Buffer.from(row.serial))).toBe(true);
  });

  it("returns 404 for a missing serial", async () => {
    const response = await getCertificatePdf(new Request("http://localhost/certificates/x/pdf"), {
      params: Promise.resolve({ serial: "GM360-DEAD-BEEF-DEAD-BEEF" }),
    });
    expect(response.status).toBe(404);
    expect(await response.text()).toMatch(/not found/i);
  });
});
