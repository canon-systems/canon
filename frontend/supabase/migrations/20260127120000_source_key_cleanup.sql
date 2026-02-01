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

-- Ensure documents and document_files have source_id (e.g. DBs from first migration only)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_id text;
ALTER TABLE document_files ADD COLUMN IF NOT EXISTS source_id text;

-- Backfill documents.source_id from workspace_repos (repo_id -> normalized repo url id)
UPDATE documents d
SET source_id = (SELECT public.normalize_repo_url_to_id(wr.repo_url) FROM public.workspace_repos wr WHERE wr.id = d.repo_id)
WHERE d.source_id IS NULL AND d.repo_id IS NOT NULL;

-- Backfill document_files.source_id from parent document
UPDATE document_files df
SET source_id = (SELECT source_id FROM documents WHERE id = df.document_id)
WHERE df.source_id IS NULL;

-- Ensure no NULLs before NOT NULL (orphan rows get placeholder)
UPDATE documents SET source_id = '' WHERE source_id IS NULL;
UPDATE document_files df
SET source_id = COALESCE((SELECT source_id FROM documents WHERE id = df.document_id), '')
WHERE df.source_id IS NULL;

-- Drop RLS policies that depend on documents.repo_id (so we can drop the column)
DROP POLICY IF EXISTS "Users can delete document files for their documents" ON document_files;
DROP POLICY IF EXISTS "Users can delete their own documents" ON documents;
DROP POLICY IF EXISTS "Users can insert document files for their documents" ON document_files;
DROP POLICY IF EXISTS "Users can insert document versions for their documents" ON document_versions;
DROP POLICY IF EXISTS "Users can insert their own documents" ON documents;
DROP POLICY IF EXISTS "Users can update document files for their documents" ON document_files;
DROP POLICY IF EXISTS "Users can update their own documents" ON documents;
DROP POLICY IF EXISTS "Users can view document files for their documents" ON document_files;
DROP POLICY IF EXISTS "Users can view document versions for their documents" ON document_versions;
DROP POLICY IF EXISTS "Users can view their own documents" ON documents;

-- Drop FK and index that reference documents.repo_id
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_repo_id_workspace_repos_fkey;
DROP INDEX IF EXISTS idx_documents_repo_id;

-- Drop legacy repo_id columns now that code uses source_id/source_key
ALTER TABLE document_files DROP COLUMN IF EXISTS repo_id;
ALTER TABLE documents DROP COLUMN IF EXISTS repo_id;

-- Enforce presence of source_id on documents and document_files
ALTER TABLE documents ALTER COLUMN source_id SET NOT NULL;
ALTER TABLE document_files ALTER COLUMN source_id SET NOT NULL;

-- Recreate RLS policies using source_id (user_owns_repo takes normalized repo id text)
CREATE POLICY "Users can delete document files for their documents" ON document_files
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_files.document_id AND public.user_owns_repo(d.source_id)
    )
  );

CREATE POLICY "Users can delete their own documents" ON documents
  FOR DELETE USING (public.user_owns_repo(documents.source_id));

CREATE POLICY "Users can insert document files for their documents" ON document_files
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_files.document_id AND public.user_owns_repo(d.source_id)
    )
  );

CREATE POLICY "Users can insert document versions for their documents" ON document_versions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_versions.document_id AND public.user_owns_repo(d.source_id)
    )
  );

CREATE POLICY "Users can insert their own documents" ON documents
  FOR INSERT WITH CHECK (public.user_owns_repo(documents.source_id));

CREATE POLICY "Users can update document files for their documents" ON document_files
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_files.document_id AND public.user_owns_repo(d.source_id)
    )
  );

CREATE POLICY "Users can update their own documents" ON documents
  FOR UPDATE USING (public.user_owns_repo(documents.source_id));

CREATE POLICY "Users can view document files for their documents" ON document_files
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_files.document_id AND public.user_owns_repo(d.source_id)
    )
  );

CREATE POLICY "Users can view document versions for their documents" ON document_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_versions.document_id AND public.user_owns_repo(d.source_id)
    )
  );

CREATE POLICY "Users can view their own documents" ON documents
  FOR SELECT USING (public.user_owns_repo(documents.source_id));

-- Note: repo_file_summaries still retains repo_id for back-compat; once
-- code fully reads source_key, you may drop repo_id and rename source_key
-- to repo_id if desired.
