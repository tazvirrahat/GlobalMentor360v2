-- Catalog search: Postgres full-text plus trigram for substring matches.
--
-- listPublishedCourses used to ILIKE across title/subtitle/description with no
-- index, which is a sequential scan the moment the catalog is a real catalog.
-- The generated tsvector is the ranked path; trigram covers the short prefix
-- queries stemming would miss ("type" vs "TypeScript").

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "courses"
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(subtitle, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS courses_search_vector_idx ON "courses" USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS courses_title_trgm_idx ON "courses" USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS courses_subtitle_trgm_idx ON "courses" USING GIN (subtitle gin_trgm_ops);
