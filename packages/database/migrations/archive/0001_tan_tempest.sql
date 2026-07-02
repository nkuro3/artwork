ALTER TABLE "artwork" ADD COLUMN "is_draft" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
-- =============================================================================
-- MANUAL ADDITION (not emitted by drizzle-kit)
-- ADD COLUMN ... DEFAULT true backfills existing rows to true. Existing artworks
-- predate the draft model and are already registered, so flip them to false.
-- Result: existing rows = false / future default (new artworks) = true.
-- =============================================================================
-- 既存作品は登録済み（下書きではない）として扱う
UPDATE "artwork" SET "is_draft" = false;