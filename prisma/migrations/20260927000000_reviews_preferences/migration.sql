-- Features plan 15: recency-weighted ranking score, notification preferences,
-- and a time zone that can mean "the site's". Written from `prisma migrate
-- diff` with its search_vector / trigram drops removed (those live in
-- hand-written migrations, not the schema).

-- Recency-weighted mean for "Highest rated": Σ wᵢrᵢ / Σ wᵢ with
-- wᵢ = 0.5^(age in days / 365), age from each visible review's last edit.
-- Same formula as recomputeCourseRating in lib/reviews.ts.
ALTER TABLE "courses" ADD COLUMN "ratingScore" DOUBLE PRECISION NOT NULL DEFAULT 0;

UPDATE "courses" AS c
SET "ratingScore" = s.score
FROM (
  SELECT
    r."courseId",
    SUM(r.rating * power(0.5, EXTRACT(EPOCH FROM ((now() AT TIME ZONE 'UTC') - r."updatedAt")) / 86400.0 / 365.0))
      / NULLIF(SUM(power(0.5, EXTRACT(EPOCH FROM ((now() AT TIME ZONE 'UTC') - r."updatedAt")) / 86400.0 / 365.0)), 0) AS score
  FROM "reviews" AS r
  WHERE r.status = 'VISIBLE'
  GROUP BY r."courseId"
) AS s
WHERE c.id = s."courseId";

-- Notification switches, all on by default (existing behaviour).
ALTER TABLE "users"
  ADD COLUMN "notifyAnnouncements" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "emailAnnouncements" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyQaReplies" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyReviewReplies" BOOLEAN NOT NULL DEFAULT true;

-- null now means "the site's time zone". 'UTC' was the column default and no
-- screen ever let anyone choose it, so those rows become null (use the site's).
ALTER TABLE "users" ALTER COLUMN "timezone" DROP NOT NULL, ALTER COLUMN "timezone" DROP DEFAULT;
UPDATE "users" SET "timezone" = NULL WHERE "timezone" = 'UTC';
