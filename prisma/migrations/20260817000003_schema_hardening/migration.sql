-- Schema hardening: review rating range, protect learner/payment trails from
-- parent deletes, bind in-progress video uploads, cheap lookup indexes.
--
-- Intentionally omitted from the Prisma-generated diff: DROP of courses.search_vector
-- and its GIN/trigram indexes. That column is GENERATED ALWAYS (see
-- 20260817000000_catalog_search) and is not modelled in schema.prisma.
-- `prisma db push` would apply that drop. Do not.

-- 1. Reviews: a star rating is 1-5. The service layer already refuses anything
-- else; this makes a raw INSERT unable to skew Course.ratingAverage.
-- Fails loudly if any existing row is out of range rather than adding a
-- constraint Postgres would reject with a less obvious error.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "reviews" WHERE "rating" < 1 OR "rating" > 5) THEN
    RAISE EXCEPTION 'reviews.rating has rows outside 1-5; refuse ck_reviews_rating_range';
  END IF;
END $$;

ALTER TABLE "reviews"
  ADD CONSTRAINT "ck_reviews_rating_range"
  CHECK ("rating" BETWEEN 1 AND 5);

-- 2. Deleting a course must not wipe enrollments, certificates, or reviews.
-- Switching ON DELETE CASCADE → RESTRICT does not rewrite rows; it only fails
-- future DELETEs of a parent that still has children. Never-purchased drafts
-- have none of these rows, so instructor cleanup still works. There is no
-- application path that deletes a course (only test cleanup).
ALTER TABLE "enrollments" DROP CONSTRAINT "enrollments_courseId_fkey";
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "certificates" DROP CONSTRAINT "certificates_courseId_fkey";
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reviews" DROP CONSTRAINT "reviews_courseId_fkey";
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Payment trail survives order deletion. No application path deletes orders
-- (test cleanup only). CASCADE here would destroy the audit of money.
ALTER TABLE "payments" DROP CONSTRAINT "payments_orderId_fkey";
ALTER TABLE "payments" ADD CONSTRAINT "payments_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Bind an in-progress upload to the instructor and curriculum item that
-- started it. Nullable: zero in-flight UPLOADING rows at apply time; older
-- rows (if any) fail closed in finalizeVideoUpload and must be re-uploaded.
ALTER TABLE "media_assets" ADD COLUMN "createdByUserId" TEXT,
ADD COLUMN "startedForItemId" TEXT;

CREATE INDEX "media_assets_createdByUserId_idx" ON "media_assets"("createdByUserId");

ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Cheap lookup indexes (order_items already unique on (orderId, courseId),
-- which does not help a courseId-only probe; orders had no status index).
CREATE INDEX "order_items_courseId_idx" ON "order_items"("courseId");
CREATE INDEX "orders_status_idx" ON "orders"("status");
