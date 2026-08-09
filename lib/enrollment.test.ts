import { describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { grantEnrollment, revokeEnrollment } from "./enrollment";

/**
 * Course.enrollmentCount is a display aggregate maintained by the one path that
 * grants access (invariant 6/7), so the thing worth testing is that it counts
 * *transitions*: retried webhooks and double-clicked approvals must not inflate
 * it, and a re-grant after a refund must.
 *
 * The fake stands in for the transaction client the Stripe webhook and bKash
 * approval already pass in. Supplying a client is what makes grantEnrollment run
 * its work inline rather than opening its own transaction, so these tests take
 * the same branch production does — the fake's shape is irrelevant to that
 * choice, which is the point of deciding on the argument instead of sniffing it.
 */
function fakeClient() {
  const enrollments = new Map<string, { revokedAt: Date | null }>();
  const counts = new Map<string, number>();
  const key = (userId: string, courseId: string) => `${userId}:${courseId}`;

  const client = {
    enrollment: {
      findUnique: ({
        where,
      }: {
        where: { userId_courseId: { userId: string; courseId: string } };
      }) => {
        const { userId, courseId } = where.userId_courseId;
        return Promise.resolve(enrollments.get(key(userId, courseId)) ?? null);
      },
      findUniqueOrThrow: ({
        where,
      }: {
        where: { userId_courseId: { userId: string; courseId: string } };
      }) => {
        const { userId, courseId } = where.userId_courseId;
        const row = enrollments.get(key(userId, courseId));
        if (!row) return Promise.reject(new Error("not found"));
        return Promise.resolve(row);
      },
      // Models ON CONFLICT DO NOTHING: an existing row makes this a no-op
      // reporting count 0, never an error.
      createMany: ({
        data,
      }: {
        data: { userId: string; courseId: string }[];
        skipDuplicates: boolean;
      }) => {
        let count = 0;
        for (const row of data) {
          if (enrollments.has(key(row.userId, row.courseId))) continue;
          enrollments.set(key(row.userId, row.courseId), { revokedAt: null });
          count += 1;
        }
        return Promise.resolve({ count });
      },
      updateMany: ({
        where,
      }: {
        where: {
          userId: string;
          courseId: string;
          revokedAt: null | { not: null };
        };
      }) => {
        const row = enrollments.get(key(where.userId, where.courseId));
        if (!row) return Promise.resolve({ count: 0 });

        // revokedAt: { not: null } is the revive filter; revokedAt: null is revoke.
        const wantsRevoked = where.revokedAt !== null;
        if (wantsRevoked) {
          if (row.revokedAt === null) return Promise.resolve({ count: 0 });
          row.revokedAt = null;
          return Promise.resolve({ count: 1 });
        }

        if (row.revokedAt !== null) return Promise.resolve({ count: 0 });
        row.revokedAt = new Date();
        return Promise.resolve({ count: 1 });
      },
    },
    course: {
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: { enrollmentCount: { increment?: number; decrement?: number } };
      }) => {
        const delta =
          (data.enrollmentCount.increment ?? 0) - (data.enrollmentCount.decrement ?? 0);
        counts.set(where.id, (counts.get(where.id) ?? 0) + delta);
        return Promise.resolve({ id: where.id });
      },
    },
  };

  return {
    client: client as unknown as Prisma.TransactionClient,
    countFor: (courseId: string) => counts.get(courseId) ?? 0,
  };
}

describe("grantEnrollment", () => {
  it("counts a first enrollment", async () => {
    const { client, countFor } = fakeClient();
    await grantEnrollment("user-1", "course-1", "PURCHASE", client);
    expect(countFor("course-1")).toBe(1);
  });

  it("does not double-count a retried grant for an active enrollment", async () => {
    const { client, countFor } = fakeClient();
    await grantEnrollment("user-1", "course-1", "PURCHASE", client);
    await grantEnrollment("user-1", "course-1", "PURCHASE", client);
    await grantEnrollment("user-1", "course-1", "PURCHASE", client);
    expect(countFor("course-1")).toBe(1);
  });

  it("counts each distinct learner", async () => {
    const { client, countFor } = fakeClient();
    await grantEnrollment("user-1", "course-1", "PURCHASE", client);
    await grantEnrollment("user-2", "course-1", "FREE", client);
    expect(countFor("course-1")).toBe(2);
  });
});

describe("revokeEnrollment", () => {
  it("decrements when it actually revokes", async () => {
    const { client, countFor } = fakeClient();
    await grantEnrollment("user-1", "course-1", "PURCHASE", client);
    await revokeEnrollment("user-1", "course-1", client);
    expect(countFor("course-1")).toBe(0);
  });

  it("does not decrement twice for a repeated refund", async () => {
    const { client, countFor } = fakeClient();
    await grantEnrollment("user-1", "course-1", "PURCHASE", client);
    await revokeEnrollment("user-1", "course-1", client);
    await revokeEnrollment("user-1", "course-1", client);
    expect(countFor("course-1")).toBe(0);
  });

  it("does not decrement for someone who was never enrolled", async () => {
    const { client, countFor } = fakeClient();
    await revokeEnrollment("user-9", "course-1", client);
    expect(countFor("course-1")).toBe(0);
  });

  it("re-counts a learner who buys again after a refund", async () => {
    const { client, countFor } = fakeClient();
    await grantEnrollment("user-1", "course-1", "PURCHASE", client);
    await revokeEnrollment("user-1", "course-1", client);
    await grantEnrollment("user-1", "course-1", "PURCHASE", client);
    expect(countFor("course-1")).toBe(1);
  });
});
