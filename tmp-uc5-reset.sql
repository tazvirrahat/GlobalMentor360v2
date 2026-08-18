-- Reset only TypeScript Foundations item completions for the seed learner.
-- Leaves course_progress.percent = 100 so we can prove the player does not
-- show a stale rollup while later lessons are locked.
WITH learner AS (
  SELECT id FROM users WHERE email = 'learner@example.com'
),
course AS (
  SELECT id FROM courses WHERE slug = 'typescript-foundations'
),
items AS (
  SELECT ci.id
  FROM curriculum_items ci
  JOIN sections s ON s.id = ci."sectionId"
  WHERE s."courseId" = (SELECT id FROM course)
),
assessments AS (
  SELECT a.id
  FROM assessments a
  WHERE a."curriculumItemId" IN (SELECT id FROM items)
)
DELETE FROM item_progress
WHERE "userId" = (SELECT id FROM learner)
  AND "curriculumItemId" IN (SELECT id FROM items);

WITH learner AS (
  SELECT id FROM users WHERE email = 'learner@example.com'
),
course AS (
  SELECT id FROM courses WHERE slug = 'typescript-foundations'
),
items AS (
  SELECT ci.id
  FROM curriculum_items ci
  JOIN sections s ON s.id = ci."sectionId"
  WHERE s."courseId" = (SELECT id FROM course)
),
assessments AS (
  SELECT a.id
  FROM assessments a
  WHERE a."curriculumItemId" IN (SELECT id FROM items)
)
DELETE FROM quiz_attempts
WHERE "userId" = (SELECT id FROM learner)
  AND "assessmentId" IN (SELECT id FROM assessments);

SELECT 'course_progress' AS src, percent::text, "completedAt"::text
FROM course_progress
WHERE "userId" = (SELECT id FROM users WHERE email = 'learner@example.com')
  AND "courseId" = (SELECT id FROM courses WHERE slug = 'typescript-foundations')
UNION ALL
SELECT 'item_progress_count', count(*)::text, NULL
FROM item_progress ip
JOIN curriculum_items ci ON ci.id = ip."curriculumItemId"
JOIN sections s ON s.id = ci."sectionId"
JOIN courses c ON c.id = s."courseId"
JOIN users u ON u.id = ip."userId"
WHERE u.email = 'learner@example.com' AND c.slug = 'typescript-foundations'
UNION ALL
SELECT 'quiz_attempts_count', count(*)::text, NULL
FROM quiz_attempts qa
JOIN assessments a ON a.id = qa."assessmentId"
JOIN curriculum_items ci ON ci.id = a."curriculumItemId"
JOIN sections s ON s.id = ci."sectionId"
JOIN courses c ON c.id = s."courseId"
JOIN users u ON u.id = qa."userId"
WHERE u.email = 'learner@example.com' AND c.slug = 'typescript-foundations';
