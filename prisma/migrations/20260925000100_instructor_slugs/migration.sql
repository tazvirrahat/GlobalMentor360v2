-- Public instructor pages live at /instructors/<slug>. users.slug already
-- exists; fill it for everyone who authors a course and has none yet. New
-- instructors get one from the app (ensureInstructorSlug) when they create a
-- course or save their profile. Data only, no schema change.
--
-- The slug follows lib/studio.ts slugify closely enough for existing names:
-- lower-case, runs of anything but a-z0-9 become "-", trimmed. Duplicates get
-- -2, -3… in id order, and a slug already taken by someone else is skipped over.

WITH instructors AS (
  SELECT u.id,
         COALESCE(NULLIF(trim(BOTH '-' FROM regexp_replace(lower(u.name), '[^a-z0-9]+', '-', 'g')), ''), 'instructor') AS base
  FROM users u
  WHERE u.slug IS NULL
    AND EXISTS (SELECT 1 FROM courses c WHERE c."instructorId" = u.id)
),
numbered AS (
  SELECT id, base, row_number() OVER (PARTITION BY base ORDER BY id) AS n
  FROM instructors
),
candidates AS (
  SELECT id,
         CASE WHEN n = 1 THEN base ELSE base || '-' || n END AS slug
  FROM numbered
)
UPDATE users u
SET slug = c.slug
FROM candidates c
WHERE u.id = c.id
  AND NOT EXISTS (SELECT 1 FROM users other WHERE other.slug = c.slug);
