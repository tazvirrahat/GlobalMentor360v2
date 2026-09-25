-- Review before publishing (lib/course-review.ts): when a course was submitted,
-- and the admin's note when it was returned. Additive; the generated diff's
-- search_vector drops are left out, as in every migration here.

-- AlterTable
ALTER TABLE "courses" ADD COLUMN "reviewNote" TEXT,
ADD COLUMN "reviewRequestedAt" TIMESTAMP(3);

-- The review queue lists IN_REVIEW courses oldest first.
CREATE INDEX "courses_review_queue_idx" ON "courses"("reviewRequestedAt") WHERE status = 'IN_REVIEW';
