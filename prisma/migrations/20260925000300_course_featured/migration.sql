-- Admin "Feature on the home page" (features plan 14). Additive: one nullable
-- column. Written from `prisma migrate diff` with its search_vector / trigram
-- drops removed (those live in hand-written migrations, not the schema).
ALTER TABLE "courses" ADD COLUMN "featuredAt" TIMESTAMP(3);
