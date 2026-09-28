import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Receipt after bKash approval. sendEmail is mocked so this never hits SES;
 * the enrollment write is real. The property that matters: a failed send must
 * not undo the grant the approval transaction already committed.
 */

const hoisted = vi.hoisted(() => ({
  adminId: "",
  sendEmail: vi.fn(async (_input?: unknown) => undefined),
}));

vi.mock("@/lib/session", () => ({
  requireRole: async () => ({
    id: hoisted.adminId,
    email: "receipt-admin@example.test",
    name: "Receipt Admin",
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

vi.mock("@/lib/email", () => ({
  sendEmail: (input: unknown) => hoisted.sendEmail(input),
}));

const { approvePayment } = await import("@/app/(app)/admin/payments/actions");
const { db } = await import("@/lib/db");
const { bkashManualRail } = await import("@/lib/payments/bkash-manual");
const { isEnrolled } = await import("@/lib/entitlement");

const run = randomUUID().slice(0, 8);
let learnerId: string;
let instructorId: string;
let courseId: string;

async function submitBkashClaim() {
  return bkashManualRail.submitProof({
    userId: learnerId,
    courseId,
    amount: 500000,
    proof: {
      transactionId: `TXN${run}${Math.random().toString(36).slice(2, 8)}`,
      phoneNumber: "01712345678",
      paymentDate: new Date().toISOString(),
      reference: null,
    },
  });
}

beforeAll(async () => {
  hoisted.adminId = (
    await db.user.create({
      data: { name: `Receipt Admin ${run}`, email: `receipt-admin-${run}@example.test` },
      select: { id: true },
    })
  ).id;
  instructorId = (
    await db.user.create({
      data: { name: `Receipt Instructor ${run}`, email: `receipt-instr-${run}@example.test` },
      select: { id: true },
    })
  ).id;
  learnerId = (
    await db.user.create({
      data: { name: `Receipt Learner ${run}`, email: `receipt-learner-${run}@example.test` },
      select: { id: true },
    })
  ).id;
  courseId = (
    await db.course.create({
      data: {
        title: `Receipt Course ${run}`,
        slug: `receipt-course-${run}`,
        status: "PUBLISHED",
        instructorId,
        publishedAt: new Date(),
      },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { actorId: hoisted.adminId } });
  await db.notification.deleteMany({ where: { userId: learnerId } });
  await db.analyticsEvent.deleteMany({ where: { userId: learnerId } });
  await db.payment.deleteMany({ where: { userId: learnerId } });
  await db.order.deleteMany({ where: { userId: learnerId } });
  await db.enrollment.deleteMany({ where: { courseId } });
  await db.course.deleteMany({ where: { id: courseId } });
  await db.user.deleteMany({
    where: { id: { in: [learnerId, instructorId, hoisted.adminId] } },
  });
  await db.$disconnect();
});

beforeEach(async () => {
  hoisted.sendEmail.mockReset();
  hoisted.sendEmail.mockResolvedValue(undefined);
  await db.auditLog.deleteMany({ where: { actorId: hoisted.adminId } });
  await db.notification.deleteMany({ where: { userId: learnerId } });
  await db.enrollment.deleteMany({ where: { courseId } });
  await db.payment.deleteMany({ where: { userId: learnerId } });
  await db.order.deleteMany({ where: { userId: learnerId } });
  await db.course.update({ where: { id: courseId }, data: { enrollmentCount: 0 } });
});

describe("bKash approval receipt", () => {
  it("mails a receipt naming the course, amount, and transaction id", async () => {
    const { paymentId } = await submitBkashClaim();
    const form = new FormData();
    form.set("paymentId", paymentId);
    form.set("notes", "Matched in the bKash portal.");

    const result = await approvePayment({ status: "idle" }, form);
    expect(result.status).toBe("done");
    expect(await isEnrolled(learnerId, courseId)).toBe(true);

    expect(hoisted.sendEmail).toHaveBeenCalledOnce();
    const payload = hoisted.sendEmail.mock.calls[0]?.[0] as unknown as {
      to: string;
      subject: string;
      text: string;
      actionUrl: string;
    };

    expect(payload.to).toBe(`receipt-learner-${run}@example.test`);
    expect(payload.subject).toContain(`Receipt Course ${run}`);
    expect(payload.text).toContain(`Receipt Course ${run}`);
    expect(payload.text).toMatch(/5,?000/);
    expect(payload.text).toMatch(/TXN/);
    expect(payload.actionUrl).toMatch(/\/orders\//);
  });

  it("keeps the enrollment when the receipt send throws", async () => {
    hoisted.sendEmail.mockRejectedValueOnce(new Error("SES timeout"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { paymentId } = await submitBkashClaim();
    const form = new FormData();
    form.set("paymentId", paymentId);
    form.set("notes", "Matched.");

    const result = await approvePayment({ status: "idle" }, form);
    expect(result.status).toBe("done");
    expect(await isEnrolled(learnerId, courseId)).toBe(true);

    const enrollment = await db.enrollment.findUnique({
      where: { userId_courseId: { userId: learnerId, courseId } },
    });
    expect(enrollment?.revokedAt).toBeNull();
  });
});
