-- Enable pg_trgm extension for GIN trigram indexes (accelerates ILIKE queries)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add GIN trigram indexes on title and description to speed up case-insensitive
-- text search (ILIKE '%term%') which previously required full sequential scans.
CREATE INDEX IF NOT EXISTS idx_grant_title_trgm ON "Grant" USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_grant_description_trgm ON "Grant" USING GIN (description gin_trgm_ops);
