import { db } from "@/lib/db";
import { listInstructorPublishedCourses, type CatalogCourse } from "@/lib/courses";
import { slugify } from "@/lib/studio";

/**
 * Public instructor pages (/instructors/<slug>) and the slug that names them.
 *
 * A profile is shown only when the person has at least one published course
 * and has not hidden their page; otherwise it is a 404, which does not confirm
 * the account exists. Numbers come from the courses' own denormalised
 * aggregates, the same ones every course row shows.
 */

export type InstructorProfile = {
  userId: string;
  name: string;
  slug: string;
  headline: string | null;
  bio: string | null;
  websiteUrl: string | null;
  courseCount: number;
  learnerCount: number;
  /** Review-count-weighted average across the published courses; null with no ratings. */
  ratingAverage: number | null;
  ratingCount: number;
  courses: CatalogCourse[];
};

/** Appends -2, -3… until free, like course slugs. */
export async function uniqueUserSlug(base: string): Promise<string> {
  const root = base || "instructor";
  let candidate = root;
  let suffix = 1;
  while (await db.user.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    suffix += 1;
    candidate = `${root}-${suffix}`;
  }
  return candidate;
}

/** Gives the user a slug if they have none, and returns it. Safe to call on every save. */
export async function ensureInstructorSlug(userId: string): Promise<string> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { slug: true, name: true } });
  if (user.slug) return user.slug;
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = await uniqueUserSlug(slugify(user.name));
    try {
      await db.user.update({ where: { id: userId }, data: { slug } });
      return slug;
    } catch (error) {
      // Someone took the slug between the check and the write; try the next one.
      if (!(error && typeof error === "object" && "code" in error && error.code === "P2002")) throw error;
    }
  }
  throw new Error("Could not assign a profile address.");
}

export async function getInstructorProfile(slug: string): Promise<InstructorProfile | null> {
  const user = await db.user.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, headline: true, bio: true, websiteUrl: true, profilePublic: true },
  });
  if (!user || !user.slug || !user.profilePublic) return null;

  const courses = await listInstructorPublishedCourses(user.id);
  if (courses.length === 0) return null;

  // Distinct people, not a sum of per-course counts: one learner in three
  // courses is one learner. Revoked (refunded) enrollments do not count.
  const [{ learners } = { learners: 0 }] = await db.$queryRaw<{ learners: number }[]>`
    SELECT COUNT(DISTINCT e."userId")::int AS learners
    FROM enrollments e
    JOIN courses c ON c.id = e."courseId"
    WHERE c."instructorId" = ${user.id} AND c.status = 'PUBLISHED' AND e."revokedAt" IS NULL
  `;

  const ratingCount = courses.reduce((sum, course) => sum + course.ratingCount, 0);
  const weighted = courses.reduce((sum, course) => sum + course.ratingAverage * course.ratingCount, 0);

  return {
    userId: user.id,
    name: user.name,
    slug: user.slug,
    headline: user.headline,
    bio: user.bio,
    websiteUrl: user.websiteUrl,
    courseCount: courses.length,
    learnerCount: learners,
    ratingAverage: ratingCount > 0 ? weighted / ratingCount : null,
    ratingCount,
    courses,
  };
}
