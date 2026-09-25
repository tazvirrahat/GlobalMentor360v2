import { monthLabel, monthStarts, weekLabel, weekStarts } from "@/lib/course-analytics-rules";
import { db } from "@/lib/db";
import { getSite } from "@/lib/site";

/**
 * One course's numbers for its instructor (spec §12 item 4), read from the
 * tables that hold the facts: enrollments, course_progress, reviews and
 * item_progress. analytics_events is not used here: it records only a few
 * event names so far, and recordEvent drops a write rather than fail the
 * thing it measures, so counting from it would undercount.
 *
 * Every figure counts active enrollments (revokedAt null); a refunded learner
 * drops out. Weeks and months are the site's calendar (Asia/Dhaka).
 */

export const ANALYTICS_WEEKS = 12;
export const ANALYTICS_MONTHS = 6;

export type CourseAnalytics = {
  learners: number;
  completed: number;
  enrolledLast30Days: number;
  ratingAverage: number | null;
  ratingCount: number;
  weeks: { start: string; label: string; enrollments: number }[];
  ratingMonths: { month: string; label: string; average: number | null; count: number }[];
  items: { id: string; title: string; type: string; sectionTitle: string; completed: number }[];
};

export async function getCourseAnalytics(courseId: string, now: Date = new Date()): Promise<CourseAnalytics> {
  const timeZone = getSite().timeZone;
  const weekKeys = weekStarts(now, ANALYTICS_WEEKS, timeZone);
  const monthKeys = monthStarts(now, ANALYTICS_MONTHS, timeZone);
  const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  // Stored timestamps are UTC without a zone: read them as UTC, then shift to the site's zone.
  const firstWeek = weekKeys[0]!;
  const firstMonth = `${monthKeys[0]!}-01`;

  const [totals, weekRows, monthRows, reviewTotals, sections, itemRows] = await Promise.all([
    db.$queryRaw<{ learners: number; completed: number; recent: number }[]>`
      SELECT
        COUNT(*)::int AS learners,
        COUNT(cp."completedAt")::int AS completed,
        COUNT(*) FILTER (WHERE e."enrolledAt" >= ${since30})::int AS recent
      FROM enrollments e
      LEFT JOIN course_progress cp ON cp."userId" = e."userId" AND cp."courseId" = e."courseId"
      WHERE e."courseId" = ${courseId} AND e."revokedAt" IS NULL
    `,
    db.$queryRaw<{ week: string; n: number }[]>`
      SELECT to_char(date_trunc('week', (e."enrolledAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}), 'YYYY-MM-DD') AS week,
             COUNT(*)::int AS n
      FROM enrollments e
      WHERE e."courseId" = ${courseId} AND e."revokedAt" IS NULL
        AND ((e."enrolledAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}) >= ${firstWeek}::date
      GROUP BY 1
    `,
    db.$queryRaw<{ month: string; average: number; n: number }[]>`
      SELECT to_char(date_trunc('month', (r."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}), 'YYYY-MM') AS month,
             AVG(r.rating)::float AS average,
             COUNT(*)::int AS n
      FROM reviews r
      WHERE r."courseId" = ${courseId} AND r.status = 'VISIBLE'
        AND ((r."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}) >= ${firstMonth}::date
      GROUP BY 1
    `,
    db.review.aggregate({
      where: { courseId, status: "VISIBLE" },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    db.section.findMany({
      where: { courseId },
      orderBy: { position: "asc" },
      select: {
        title: true,
        items: { orderBy: { position: "asc" }, select: { id: true, title: true, type: true } },
      },
    }),
    db.$queryRaw<{ itemId: string; completed: number }[]>`
      SELECT ip."curriculumItemId" AS "itemId", COUNT(*)::int AS completed
      FROM item_progress ip
      JOIN curriculum_items ci ON ci.id = ip."curriculumItemId"
      JOIN sections s ON s.id = ci."sectionId"
      JOIN enrollments e ON e."userId" = ip."userId" AND e."courseId" = s."courseId" AND e."revokedAt" IS NULL
      WHERE s."courseId" = ${courseId} AND ip."completedAt" IS NOT NULL
      GROUP BY 1
    `,
  ]);

  const weekCounts = new Map(weekRows.map((row) => [row.week, row.n]));
  const monthStats = new Map(monthRows.map((row) => [row.month, row]));
  const itemCounts = new Map(itemRows.map((row) => [row.itemId, row.completed]));
  const total = totals[0] ?? { learners: 0, completed: 0, recent: 0 };

  return {
    learners: total.learners,
    completed: total.completed,
    enrolledLast30Days: total.recent,
    ratingAverage: reviewTotals._count._all > 0 ? (reviewTotals._avg.rating ?? null) : null,
    ratingCount: reviewTotals._count._all,
    weeks: weekKeys.map((start) => ({ start, label: weekLabel(start), enrollments: weekCounts.get(start) ?? 0 })),
    ratingMonths: monthKeys.map((month) => {
      const stat = monthStats.get(month);
      return { month, label: monthLabel(month), average: stat ? stat.average : null, count: stat?.n ?? 0 };
    }),
    items: sections.flatMap((section) =>
      section.items.map((item) => ({
        id: item.id,
        title: item.title,
        type: item.type,
        sectionTitle: section.title,
        completed: itemCounts.get(item.id) ?? 0,
      })),
    ),
  };
}
