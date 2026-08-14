import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The bKash happy path and the convergence check, driven through the real admin
 * action rather than around it.
 *
 * docs/TECH-SPEC.md asks for "approve it as an admin, confirm the enrollment
 * appears and verified_by is populated", and for both rails to produce
 * structurally identical enrollment rows. Calling grantEnrollment directly would
 * satisfy neither: it is the function both rails already share, so a test built
 * on it stays green even if approvePayment grows its own enrollment write — which
 * is the drift invariant 7 exists to prevent.
 *
 * So this file drives approvePayment itself. That means faking the two Next.js
 * request-scoped concerns it depends on — the session it reads through
 * requireRole, and revalidatePath — and nothing else. The transaction, the DB
 * CHECK constraints, grantEnrollment, and the audit-log write are all real.
 */

const hoisted = vi.hoisted(() => ({ adminId: "" }));

vi.mock("@/lib/session", () => ({
  requireRole: async () => ({
    id: hoisted.adminId,
    email: "integration-admin@example.test",
    name: "Integration Admin",
  }),
}));

// revalidatePath throws outside a request scope; the cache is not under test.
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { approvePayment } = await import("@/app/admin/payments/actions");
const { db } = await import("@/lib/db");
const { bkashManualRail } = await import("@/lib/payments/bkash-manual");
const { stripeRail } = await import("@/lib/payments/stripe");
const { isEnrolled } = await import("@/lib/entitlement");
const { signedEvent } = await import("./signed-event");

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
      data: { name: `Approval Admin ${run}`, email: `approval-admin-${run}@example.test` },
      select: { id: true },
    })
  ).id;
  instructorId = (
    await db.user.create({
      data: { name: `Approval Instructor ${run}`, email: `approval-instr-${run}@example.test` },
      select: { id: true },
    })
  ).id;
  learnerId = (
    await db.user.create({
      data: { name: `Approval Learner ${run}`, email: `approval-learner-${run}@example.test` },
      select: { id: true },
    })
  ).id;
  courseId = (
    await db.course.create({
      data: {
        title: `Approval Course ${run}`,
        slug: `approval-course-${run}`,
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
  await db.auditLog.deleteMany({ where: { actorId: hoisted.adminId } });
  await db.enrollment.deleteMany({ where: { courseId } });
  await db.payment.deleteMany({ where: { userId: learnerId } });
  await db.order.deleteMany({ where: { userId: learnerId } });
  await db.course.update({ where: { id: courseId }, data: { enrollmentCount: 0 } });
});

describe("bKash happy path", () => {
  it("holds access until an admin approves, then grants it", async () => {
    const { paymentId } = await submitBkashClaim();
    expect(await isEnrolled(learnerId, courseId)).toBe(false);

    const form = new FormData();
    form.set("paymentId", paymentId);
    form.set("notes", "Matched in the bKash portal.");
    const result = await approvePayment({ status: "idle" }, form);

    expect(result.status).toBe("done");
    expect(await isEnrolled(learnerId, courseId)).toBe(true);

    const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe("COMPLETED");
    // The load-bearing constraint: COMPLETED is only reachable with a verifier.
    expect(payment.verifiedById).toBe(hoisted.adminId);
    expect(payment.verifiedAt).not.toBeNull();

    const order = await db.order.findUniqueOrThrow({ where: { id: payment.orderId } });
    expect(order.status).toBe("PAID");

    const audit = await db.auditLog.findFirst({
      where: { actorId: hoisted.adminId, action: "payment.approve", targetId: paymentId },
    });
    expect(audit).not.toBeNull();
  });

  it("does not double-enroll or double-count when an admin double-clicks", async () => {
    const { paymentId } = await submitBkashClaim();

    const form = () => {
      const f = new FormData();
      f.set("paymentId", paymentId);
      f.set("notes", "Approved.");
      return f;
    };

    const [first, second] = await Promise.all([
      approvePayment({ status: "idle" }, form()),
      approvePayment({ status: "idle" }, form()),
    ]);

    // Exactly one wins; the loser is told so rather than shown a false success.
    const outcomes = [first.status, second.status].sort();
    expect(outcomes).toEqual(["done", "error"]);

    expect(await db.enrollment.count({ where: { userId: learnerId, courseId } })).toBe(1);
    const course = await db.course.findUniqueOrThrow({
      where: { id: courseId },
      select: { enrollmentCount: true },
    });
    expect(course.enrollmentCount).toBe(1);
    expect(
      await db.auditLog.count({ where: { actorId: hoisted.adminId, action: "payment.approve" } }),
    ).toBe(1);
  });
});

describe("both rails converge (invariant 7)", () => {
  it("produces structurally identical enrollments from the webhook and from admin approval", async () => {
    // Rail 1: Stripe, through the signed webhook.
    const order = await db.order.create({
      data: {
        userId: learnerId,
        status: "PENDING",
        currency: "USD",
        subtotal: 4900,
        total: 4900,
        items: { create: { courseId, unitPrice: 4900 } },
      },
    });
    const payment = await db.payment.create({
      data: {
        orderId: order.id,
        userId: learnerId,
        method: "STRIPE",
        status: "PENDING",
        amount: 4900,
        currency: "USD",
      },
    });
    await stripeRail.confirm(
      signedEvent({
        eventId: `evt_${run}_conv`,
        sessionId: `cs_${run}_conv`,
        paymentIntentId: `pi_${run}_conv`,
        paymentStatus: "paid",
        metadata: {
          orderId: order.id,
          paymentId: payment.id,
          courseId,
          userId: learnerId,
        },
      }),
    );
    const fromStripe = await db.enrollment.findUniqueOrThrow({
      where: { userId_courseId: { userId: learnerId, courseId } },
    });

    // Rail 2: bKash, through the admin action — not through grantEnrollment.
    await db.enrollment.deleteMany({ where: { courseId } });
    await db.course.update({ where: { id: courseId }, data: { enrollmentCount: 0 } });
    const { paymentId } = await submitBkashClaim();
    const form = new FormData();
    form.set("paymentId", paymentId);
    form.set("notes", "Verified.");
    await approvePayment({ status: "idle" }, form);

    const fromBkash = await db.enrollment.findUniqueOrThrow({
      where: { userId_courseId: { userId: learnerId, courseId } },
    });

    expect(fromBkash.userId).toBe(fromStripe.userId);
    expect(fromBkash.courseId).toBe(fromStripe.courseId);
    expect(fromBkash.revokedAt).toBe(fromStripe.revokedAt);
    expect(fromBkash.archivedAt).toBe(fromStripe.archivedAt);
    // Both rails record a purchase; the source column is where a grant or a free
    // enrolment would differ, and neither rail is either of those.
    expect(fromStripe.source).toBe("PURCHASE");
    expect(fromBkash.source).toBe("PURCHASE");
  });
});
