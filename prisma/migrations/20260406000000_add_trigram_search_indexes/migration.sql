-- Enable pg_trgm extension for GIN trigram indexes (accelerates ILIKE queries).
-- Wrapped in a DO block so the migration succeeds even if pg_trgm is unavailable.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS idx_grant_title_trgm ON "Grant" USING GIN (title gin_trgm_ops);
  CREATE INDEX IF NOT EXISTS idx_grant_description_trgm ON "Grant" USING GIN (description gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm extension not available, skipping trigram indexes: %', SQLERRM;
END;
$$;
