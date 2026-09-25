// Route IDs change on every reseed, so the audit looks them up instead of
// hardcoding UUIDs. Reads the same DATABASE_URL as the dev server.
import "dotenv/config";
import pg from "pg";

export async function lookupIds() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const one = async (sql, params = []) => (await client.query(sql, params)).rows[0] ?? {};
  try {
    const course = await one(`SELECT id FROM courses WHERE slug = 'typescript-foundations'`);
    const firstOf = (type) =>
      one(
        `SELECT ci.id FROM curriculum_items ci
           JOIN sections s ON s.id = ci."sectionId"
          WHERE s."courseId" = $1 AND ci.type = $2
          ORDER BY s.position, ci.position
          LIMIT 1`,
        [course.id, type],
      );
    const article = await firstOf("LECTURE");
    const quiz = await firstOf("QUIZ");
    const learner = await one(`SELECT id FROM users WHERE email = 'learner@example.com'`);
    const order = await one(
      `SELECT id FROM orders WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
      [learner.id],
    );
    const cert = await one(`SELECT serial FROM certificates WHERE "userId" = $1 LIMIT 1`, [learner.id]);
    // The instructor of the audited course, for their public page.
    const instructor = await one(
      `SELECT u.slug FROM users u JOIN courses c ON c."instructorId" = u.id
        WHERE c.slug = 'typescript-foundations' AND u.slug IS NOT NULL AND u."profilePublic" LIMIT 1`,
    );
    // A published course the learner has not bought, for the checkout page.
    const buy = await one(
      `SELECT c.slug FROM courses c
        WHERE c.status = 'PUBLISHED'
          AND NOT EXISTS (
            SELECT 1 FROM enrollments e
             WHERE e."courseId" = c.id AND e."userId" = $1 AND e."revokedAt" IS NULL)
        ORDER BY c.slug LIMIT 1`,
      [learner.id],
    );

    return {
      course: "typescript-foundations",
      courseId: course.id ?? null,
      article: article.id ?? null,
      quiz: quiz.id ?? null,
      buyCourse: buy.slug ?? null,
      order: order.id ?? null,
      cert: cert.serial ?? null,
      instructorSlug: instructor.slug ?? null,
    };
  } finally {
    await client.end();
  }
}

/** [role, name, path] for every audited route; routes whose id is missing are dropped with a note. */
export function buildRoutes(ids) {
  const need = (value, route) => (value ? route : null);
  const routes = [
    ["public", "home", "/"],
    ["public", "catalog", "/courses"],
    ["public", "landing", `/courses/${ids.course}`],
    ["public", "sign-in", "/sign-in"],
    ["public", "sign-up", "/sign-up"],
    ["public", "forgot", "/forgot-password"],
    ["public", "certificate", need(ids.cert, `/certificates/${ids.cert}`)],
    ["public", "instructor", need(ids.instructorSlug, `/instructors/${ids.instructorSlug}`)],
    ["public", "not-found", "/courses/this-does-not-exist"],
    ["learner", "dashboard", "/dashboard"],
    ["learner", "account", "/account"],
    ["learner", "cart", "/cart"],
    ["learner", "orders", "/orders"],
    ["learner", "order", need(ids.order, `/orders/${ids.order}`)],
    ["learner", "notifications", "/notifications"],
    ["learner", "checkout", need(ids.buyCourse, `/courses/${ids.buyCourse}/checkout`)],
    ["learner", "learn-article", need(ids.article, `/learn/${ids.course}/${ids.article}`)],
    ["learner", "learn-quiz", need(ids.quiz, `/learn/${ids.course}/${ids.quiz}`)],
    ["instructor", "studio", "/studio"],
    ["instructor", "studio-course", need(ids.courseId, `/studio/courses/${ids.courseId}`)],
    ["instructor", "studio-curriculum", need(ids.courseId, `/studio/courses/${ids.courseId}/curriculum`)],
    ["instructor", "studio-analytics", need(ids.courseId, `/studio/courses/${ids.courseId}/analytics`)],
    [
      "instructor",
      "studio-item",
      need(ids.courseId && ids.article, `/studio/courses/${ids.courseId}/curriculum/${ids.article}`),
    ],
    ["instructor", "studio-qa", "/studio/qa"],
    ["instructor", "studio-announce", "/studio/announcements"],
    ["instructor", "studio-coupons", "/studio/coupons"],
    ["admin", "admin-payments", "/admin/payments"],
    ["admin", "admin-refunds", "/admin/refunds"],
    ["admin", "admin-users", "/admin/users"],
    ["admin", "admin-courses", "/admin/courses"],
    ["admin", "admin-course", need(ids.courseId, `/admin/courses/${ids.courseId}`)],
    ["admin", "admin-taxonomy", "/admin/taxonomy"],
    ["admin", "admin-videos", "/admin/videos"],
    ["admin", "admin-reviews", "/admin/reviews"],
  ];

  const only = process.env.ONLY?.split(",").map((s) => s.trim()).filter(Boolean);
  const kept = [];
  for (const [role, name, route] of routes) {
    if (only && !only.includes(name)) continue;
    if (!route) {
      console.log(`skip ${name}: no matching row in the database`);
      continue;
    }
    kept.push([role, name, route]);
  }
  return kept;
}

export const EMAILS = {
  learner: "learner@example.com",
  instructor: "instructor@example.com",
  admin: "admin@example.com",
};

export const PASSWORD = "dev-password-12345";

export async function signIn(context, base, role) {
  const res = await context.request.post(`${base}/api/auth/sign-in/email`, {
    data: { email: EMAILS[role], password: PASSWORD },
    headers: { "content-type": "application/json", origin: base },
  });
  if (!res.ok()) throw new Error(`sign-in ${EMAILS[role]} -> ${res.status()}`);
}
