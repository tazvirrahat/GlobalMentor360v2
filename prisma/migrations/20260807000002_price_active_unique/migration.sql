-- "At most one ACTIVE price per course per currency" as a partial unique index.
--
-- Prisma cannot express partial unique indexes in schema.prisma, so this lives
-- here in raw SQL — same reason and same pattern as the payments CHECK
-- constraints in 20260807000001. Anything that regenerates the schema leaves it
-- alone, but a diff that wants to DROP it is a mistake, not a cleanup.
--
-- Prior art: docs/PRIOR-ART.md#1-conditional-check-constraints-for-multi-method-payments

-- The constraint being replaced was UNIQUE (courseId, currency, isActive). That
-- reads as the right rule and is not: because isActive is part of the key, it
-- also permits exactly ONE INACTIVE row per (course, currency). Archiving a
-- second price change collides with the first archived row, so price history is
-- capped at a single entry per currency and the second edit fails outright.
DROP INDEX "prices_courseId_currency_isActive_key";

-- Two active prices in different currencies is the normal case, not an edge
-- case: Stripe settles in USD and bKash settles in BDT, so a course sold on both
-- rails needs one active price in each (docs/FEATURES.md section I). What must
-- never exist is two active prices in the SAME currency — that is what made the
-- catalog price depend on which row Postgres returned first.
--
-- Inactive rows are deliberately unconstrained: they are the price history, and
-- there can be as many as the course has had prices.
CREATE UNIQUE INDEX "prices_course_currency_active_key"
  ON "prices" ("courseId", "currency")
  WHERE "isActive";
