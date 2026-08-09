-- Course.enrollmentCount is a denormalised display aggregate that was read in
-- several places and written in none, so every existing row reads 0 while the
-- catalog and the studio present it as fact.
--
-- grantEnrollment now maintains it, but only from the moment it runs. Rows that
-- predate that change need one correction, and the correction has to be the
-- derived truth rather than an increment: the counter and the enrollments table
-- disagree by an unknown amount.
UPDATE "courses" c
SET "enrollmentCount" = (
  SELECT count(*)
  FROM "enrollments" e
  WHERE e."courseId" = c.id
    AND e."revokedAt" IS NULL
);

-- The counter must never go negative.
--
-- Without this, the first refund on any course whose counter was still a stale 0
-- decrements it to -1 and the landing page renders "-1 enrolled". More usefully,
-- the constraint turns any future drift in the maintenance logic into a failed
-- write at the point of the bug, instead of a wrong number on a public page that
-- nobody can date. revokeEnrollment only decrements by the row count its own
-- UPDATE matched, so a correct implementation cannot trip this.
ALTER TABLE "courses"
  ADD CONSTRAINT "ck_courses_enrollment_count_nonneg"
  CHECK ("enrollmentCount" >= 0);
