import pg from "pg";

const c = new pg.Client({
  connectionString:
    "postgresql://postgres:postgres@localhost:5432/globalmentor360?schema=public",
});
await c.connect();
const users = await c.query(`SELECT id, email FROM users WHERE email = 'learner@example.com'`);
console.log("user", users.rows);
const uid = users.rows[0]?.id;
const enroll = await c.query(
  `SELECT e.id, e.source, e."revokedAt", c.slug FROM enrollments e JOIN courses c ON c.id = e."courseId" WHERE e."userId" = $1`,
  [uid],
);
console.log("enrollments", enroll.rows);
const items = await c.query(
  `
  SELECT c.slug, ci.id, ci.title, ci."isPreview", ci.type, s.title as section, s.position as sec, ci.position as pos,
         lp."completedAt", lp."lastPositionSeconds"
  FROM curriculum_items ci
  JOIN sections s ON s.id = ci."sectionId"
  JOIN courses c ON c.id = s."courseId"
  LEFT JOIN item_progress lp ON lp."curriculumItemId" = ci.id AND lp."userId" = $1
  WHERE c.slug IN ('typescript-foundations','sql-for-analysts')
  ORDER BY c.slug, s.position, ci.position
`,
  [uid],
);
console.log(JSON.stringify(items.rows, null, 2));
const courses = await c.query(`SELECT slug, status FROM courses WHERE slug IN ('typescript-foundations','sql-for-analysts')`);
console.log("courses", courses.rows);
await c.end();
