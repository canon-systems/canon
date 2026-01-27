-- Add source_key to repo_file_summaries for source-first lookup
ALTER TABLE repo_file_summaries
ADD COLUMN IF NOT EXISTS source_key text;

-- Backfill source_key from existing repo_id
UPDATE repo_file_summaries
SET source_key = repo_id
WHERE source_key IS NULL;

-- Create case-insensitive index for source_key lookups
CREATE INDEX IF NOT EXISTS idx_repo_file_summaries_source_key_ci
  ON repo_file_summaries (lower(source_key));

-- Optional: keep helper function to normalize keys per provider (not needed in SQL)

-- Drop legacy repo_id columns now that code uses source_id/source_key
ALTER TABLE document_files DROP COLUMN IF EXISTS repo_id;
ALTER TABLE documents DROP COLUMN IF EXISTS repo_id;

-- Enforce presence of source_id on documents and document_files
ALTER TABLE documents ALTER COLUMN source_id SET NOT NULL;
ALTER TABLE document_files ALTER COLUMN source_id SET NOT NULL;

-- Note: repo_file_summaries still retains repo_id for back-compat; once
-- code fully reads source_key, you may drop repo_id and rename source_key
-- to repo_id if desired.
