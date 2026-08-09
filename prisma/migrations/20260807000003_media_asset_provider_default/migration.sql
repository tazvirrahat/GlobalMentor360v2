-- The video vendor default still said "bunny" after AWS superseded it
-- (docs/TECH-SPEC.md "Video: AWS, superseding Bunny"). Nothing reads it today —
-- the upload path passes `video.name` from lib/video explicitly — so this only
-- decides what a row written outside that path claims about itself. A default
-- that names the wrong vendor is a trap for the first such writer.
ALTER TABLE "media_assets" ALTER COLUMN "provider" SET DEFAULT 'aws';
