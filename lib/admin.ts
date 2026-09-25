import type { Role } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { clampPage, pageCount, skipTake, type Paged } from "@/lib/pagination";
import { recomputeCourseRating } from "@/lib/reviews";
import { readinessChecks } from "@/lib/studio";

/**
 * Admin reads and writes that are not the payment queue.
 *
 * Role changes never remove the last ADMIN — locking yourself (or the only
 * other admin) out of the queue that grants access is how a platform becomes
 * unrecoverable without a database shell.
 */

export const ADMIN_PAGE_SIZE = 20;

export async function listAdminUsers(query?: string, page?: string | number) {
  const where = query
    ? {
        OR: [
          { email: { contains: query, mode: "insensitive" as const } },
          { name: { contains: query, mode: "insensitive" as const } },
        ],
      }
    : {};

  const total = await db.user.count({ where });
  const current = clampPage(page, total, ADMIN_PAGE_SIZE);
  const { skip, take } = skipTake(current, ADMIN_PAGE_SIZE);
  const items = await db.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip,
    take,
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      status: true,
      createdAt: true,
      roles: { select: { role: true } },
    },
  });

  return { items, total, page: current, pageCount: pageCount(total, ADMIN_PAGE_SIZE) } satisfies Paged<
    (typeof items)[number]
  >;
}

export async function setUserRole(
  actorId: string,
  userId: string,
  role: Role,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (role === "ADMIN" && !enabled && userId === actorId) {
    return { ok: false, message: "You cannot remove your own admin role." };
  }

  if (role === "ADMIN" && !enabled) {
    const admins = await db.userRole.count({ where: { role: "ADMIN" } });
    if (admins <= 1) {
      return { ok: false, message: "The last admin cannot be removed." };
    }
  }

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return { ok: false, message: "User not found." };

  if (enabled) {
    await db.userRole.upsert({
      where: { userId_role: { userId, role } },
      create: { userId, role },
      update: {},
    });
  } else {
    await db.userRole.deleteMany({ where: { userId, role } });
  }

  await db.auditLog.create({
    data: {
      actorId,
      action: enabled ? "user.role.grant" : "user.role.revoke",
      targetType: "user",
      targetId: userId,
      metadata: { role },
    },
  });

  return { ok: true };
}

export async function listAdminCourses(query?: string, page?: string | number) {
  const where = query
    ? {
        OR: [
          { title: { contains: query, mode: "insensitive" as const } },
          { slug: { contains: query, mode: "insensitive" as const } },
        ],
      }
    : {};

  const total = await db.course.count({ where });
  const current = clampPage(page, total, ADMIN_PAGE_SIZE);
  const { skip, take } = skipTake(current, ADMIN_PAGE_SIZE);
  const items = await db.course.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    skip,
    take,
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      publishedAt: true,
      enrollmentCount: true,
      instructor: { select: { name: true, email: true } },
      // For the "published but unpayable" flag — see courseSellabilityWarning.
      prices: { where: { isActive: true }, select: { currency: true, amount: true } },
    },
  });

  return { items, total, page: current, pageCount: pageCount(total, ADMIN_PAGE_SIZE) } satisfies Paged<
    (typeof items)[number]
  >;
}

export async function adminSetCoursePublished(
  actorId: string,
  courseId: string,
  publish: boolean,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { id: true, slug: true, status: true, publishedAt: true },
  });
  if (!course) return { ok: false, message: "Course not found." };

  if (publish) {
    const checks = await readinessChecks(course.id);
    const failed = checks.filter((check) => !check.ok);
    if (failed.length > 0 && !course.publishedAt) {
      return {
        ok: false,
        message: `Not ready to publish: ${failed.map((item) => item.label.toLowerCase()).join(", ")}.`,
      };
    }
  }

  await db.course.update({
    where: { id: course.id },
    data: {
      status: publish ? "PUBLISHED" : "UNPUBLISHED",
      publishedAt: publish ? (course.publishedAt ?? new Date()) : undefined,
    },
  });

  await db.auditLog.create({
    data: {
      actorId,
      action: publish ? "course.publish" : "course.unpublish",
      targetType: "course",
      targetId: course.id,
      metadata: { slug: course.slug },
    },
  });

  return { ok: true };
}

/** Every review, newest first. `query` matches the course title, the learner's name or email, or the text. */
export async function listAdminReviews(query?: string, page?: string | number) {
  const q = query?.trim();
  const where = q
    ? {
        OR: [
          { course: { title: { contains: q, mode: "insensitive" as const } } },
          { user: { name: { contains: q, mode: "insensitive" as const } } },
          { user: { email: { contains: q, mode: "insensitive" as const } } },
          { body: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};
  const total = await db.review.count({ where });
  const current = clampPage(page, total, ADMIN_PAGE_SIZE);
  const { skip, take } = skipTake(current, ADMIN_PAGE_SIZE);
  const items = await db.review.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip,
    take,
    select: {
      id: true,
      rating: true,
      body: true,
      status: true,
      createdAt: true,
      courseId: true,
      user: { select: { name: true, email: true } },
      course: { select: { title: true, slug: true } },
    },
  });

  return { items, total, page: current, pageCount: pageCount(total, ADMIN_PAGE_SIZE) } satisfies Paged<
    (typeof items)[number]
  >;
}

export async function setReviewVisibility(
  actorId: string,
  reviewId: string,
  visible: boolean,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const review = await db.review.findUnique({
    where: { id: reviewId },
    select: { id: true, courseId: true, status: true },
  });
  if (!review) return { ok: false, message: "Review not found." };

  const next = visible ? "VISIBLE" : "HIDDEN";
  if (review.status === next) return { ok: true };

  await db.review.update({ where: { id: review.id }, data: { status: next } });
  await recomputeCourseRating(review.courseId);

  await db.auditLog.create({
    data: {
      actorId,
      action: visible ? "review.restore" : "review.hide",
      targetType: "review",
      targetId: review.id,
      metadata: { courseId: review.courseId },
    },
  });

  return { ok: true };
}
