-- Optional course scope: a coupon is catalog-wide (NULL) or pinned to one course.
-- Instructors cannot mint catalog-wide codes; that is enforced in application
-- code. The FK keeps a scoped coupon from pointing at a missing course. CASCADE
-- deletes the coupon with the course rather than silently promoting it to global.

ALTER TABLE "coupons"
  ADD CONSTRAINT "coupons_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "courses"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "coupons_courseId_idx" ON "coupons"("courseId");
