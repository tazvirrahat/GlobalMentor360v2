import { db } from "@/lib/db";

export type LearningTab = "in-progress" | "completed" | "archived";

/** My learning opens on the first non-empty tab, never on an empty one beside a full one. */
export function defaultLearningTab(counts: { inProgress: number; completed: number; archived: number }): LearningTab {
  if (counts.inProgress > 0) return "in-progress";
  if (counts.completed > 0) return "completed";
  if (counts.archived > 0) return "archived";
  return "in-progress";
}

export type PendingPayment = { orderId: string; courseTitles: string[]; submittedAt: Date };

/** bKash payments this learner submitted that an admin has not checked yet. */
export async function listPendingPayments(userId: string): Promise<PendingPayment[]> {
  const rows = await db.payment.findMany({
    where: { userId, status: "PENDING_VERIFICATION" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      orderId: true,
      createdAt: true,
      order: { select: { items: { select: { course: { select: { title: true } } } } } },
    },
  });
  return rows.map((row) => ({
    orderId: row.orderId,
    submittedAt: row.createdAt,
    courseTitles: row.order.items.map((item) => item.course.title),
  }));
}
