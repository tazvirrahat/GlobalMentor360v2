import { db } from "@/lib/db";

export type HomeStats = {
  courses: number;
  learners: number;
  instructors: number;
  reviews: number;
  averageRating: number | null;
};

/** Real numbers for the home page's trust strip. Nothing here is rounded up or invented. */
export async function getHomeStats(): Promise<HomeStats> {
  const [courses, learners, instructors, rating] = await Promise.all([
    db.course.count({ where: { status: "PUBLISHED" } }),
    db.enrollment.groupBy({ by: ["userId"], where: { revokedAt: null } }).then((rows) => rows.length),
    db.course
      .groupBy({ by: ["instructorId"], where: { status: "PUBLISHED" } })
      .then((rows) => rows.length),
    db.review.aggregate({ where: { status: "VISIBLE" }, _avg: { rating: true }, _count: { _all: true } }),
  ]);
  return {
    courses,
    learners,
    instructors,
    reviews: rating._count._all,
    averageRating: rating._avg.rating,
  };
}
