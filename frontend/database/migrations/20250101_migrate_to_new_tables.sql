-- Migration: Migrate to New Simple Table Structure
-- Date: 2025-01-01
-- Description: Fixes foreign keys, constraints, and ensures proper relationships
--              after migrating from old tables (submissions, file_summaries, repos)
--              to new tables (documents, repo_file_summaries, workspace_repos)

BEGIN;

-- ============================================================================
-- 1. FIX DOCUMENTS TABLE FOREIGN KEY
-- ============================================================================
-- The documents table currently references repos.id, but should reference workspace_repos.id
-- First, check if the constraint exists and drop it
DO $$
BEGIN
    -- Drop old foreign key constraint if it exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'documents_repo_id_fkey'
    ) THEN
        ALTER TABLE public.documents 
        DROP CONSTRAINT documents_repo_id_fkey;
    END IF;
END $$;

-- Add new foreign key constraint to workspace_repos
-- Note: This assumes documents.repo_id contains workspace_repos.id values
-- If you have data in repos table that needs migration, do that first
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'documents_repo_id_workspace_repos_fkey'
    ) THEN
        ALTER TABLE public.documents
        ADD CONSTRAINT documents_repo_id_workspace_repos_fkey
        FOREIGN KEY (repo_id) 
        REFERENCES public.workspace_repos(id) 
        ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================================================
-- 2. ENSURE DOCUMENT_FILES HAS PROPER CONSTRAINTS
-- ============================================================================
-- Ensure document_files has a composite primary key or unique constraint
DO $$
BEGIN
    -- Add unique constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'document_files_document_id_file_path_key'
    ) THEN
        ALTER TABLE public.document_files
        ADD CONSTRAINT document_files_document_id_file_path_key
        UNIQUE (document_id, file_path);
    END IF;
END $$;

-- Ensure foreign key to documents exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'document_files_document_id_fkey'
    ) THEN
        ALTER TABLE public.document_files
        ADD CONSTRAINT document_files_document_id_fkey
        FOREIGN KEY (document_id) 
        REFERENCES public.documents(id) 
        ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================================================
-- 3. ENSURE DOCUMENT_VERSIONS HAS PROPER CONSTRAINTS
-- ============================================================================
-- Ensure unique constraint on (document_id, version_number)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'document_versions_document_id_version_number_key'
    ) THEN
        ALTER TABLE public.document_versions
        ADD CONSTRAINT document_versions_document_id_version_number_key
        UNIQUE (document_id, version_number);
    END IF;
END $$;

-- Ensure foreign key to documents exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'document_versions_document_id_fkey'
    ) THEN
        ALTER TABLE public.document_versions
        ADD CONSTRAINT document_versions_document_id_fkey
        FOREIGN KEY (document_id) 
        REFERENCES public.documents(id) 
        ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================================================
-- 4. ENSURE REPOSITORY_SETUP HAS PROPER FOREIGN KEY
-- ============================================================================
-- Ensure repository_setup.repo_id references workspace_repos.id
DO $$
BEGIN
    -- Drop old constraint if it exists (in case it referenced repos table)
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'repository_setup_repo_id_fkey'
        AND conrelid = 'public.repository_setup'::regclass
    ) THEN
        ALTER TABLE public.repository_setup 
        DROP CONSTRAINT repository_setup_repo_id_fkey;
    END IF;
    
    -- Add correct constraint
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'repository_setup_repo_id_workspace_repos_fkey'
    ) THEN
        ALTER TABLE public.repository_setup
        ADD CONSTRAINT repository_setup_repo_id_workspace_repos_fkey
        FOREIGN KEY (repo_id) 
        REFERENCES public.workspace_repos(id) 
        ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================================================
-- 5. ENSURE ARCHITECTURE_DIAGRAMS REFERENCES WORKSPACE_REPOS
-- ============================================================================
-- Update architecture_diagrams.repo_id to reference workspace_repos if needed
DO $$
BEGIN
    -- Drop old constraint if it exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'architecture_diagrams_repo_id_fkey'
        AND conrelid = 'public.architecture_diagrams'::regclass
    ) THEN
        ALTER TABLE public.architecture_diagrams 
        DROP CONSTRAINT architecture_diagrams_repo_id_fkey;
    END IF;
    
    -- Add correct constraint (only if repo_id is not null)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'architecture_diagrams_repo_id_workspace_repos_fkey'
    ) THEN
        ALTER TABLE public.architecture_diagrams
        ADD CONSTRAINT architecture_diagrams_repo_id_workspace_repos_fkey
        FOREIGN KEY (repo_id) 
        REFERENCES public.workspace_repos(id) 
        ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================================================
-- 6. CREATE MISSING INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index on documents.repo_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_documents_repo_id 
ON public.documents(repo_id);

-- Index on document_files.document_id
CREATE INDEX IF NOT EXISTS idx_document_files_document_id 
ON public.document_files(document_id);

-- Index on document_files.file_path for faster file lookups
CREATE INDEX IF NOT EXISTS idx_document_files_file_path 
ON public.document_files(file_path);

-- Index on document_versions.document_id
CREATE INDEX IF NOT EXISTS idx_document_versions_document_id 
ON public.document_versions(document_id);

-- Index on document_versions for version queries
CREATE INDEX IF NOT EXISTS idx_document_versions_document_version 
ON public.document_versions(document_id, version_number DESC);

-- Index on repository_setup.repo_id
CREATE INDEX IF NOT EXISTS idx_repository_setup_repo_id 
ON public.repository_setup(repo_id);

-- ============================================================================
-- 7. ENSURE REPO_FILE_SUMMARIES HAS PROPER INDEXES
-- ============================================================================

-- These should already exist, but ensure they're there
CREATE INDEX IF NOT EXISTS idx_repo_file_summaries_repo_id 
ON public.repo_file_summaries(repo_id);

CREATE INDEX IF NOT EXISTS idx_repo_file_summaries_repo_hash 
ON public.repo_file_summaries(repo_id, file_hash);

CREATE INDEX IF NOT EXISTS idx_repo_file_summaries_file_path 
ON public.repo_file_summaries(file_path);

CREATE INDEX IF NOT EXISTS idx_repo_file_summaries_branch 
ON public.repo_file_summaries(repo_id, branch);

-- ============================================================================
-- 8. DATA INTEGRITY CHECKS AND CLEANUP
-- ============================================================================

-- Remove orphaned document_files (documents that don't exist)
DELETE FROM public.document_files df
WHERE NOT EXISTS (
    SELECT 1 FROM public.documents d 
    WHERE d.id = df.document_id
);

-- Remove orphaned document_versions (documents that don't exist)
DELETE FROM public.document_versions dv
WHERE NOT EXISTS (
    SELECT 1 FROM public.documents d 
    WHERE d.id = dv.document_id
);

-- Remove orphaned documents (workspace_repos that don't exist)
-- Note: This is commented out as it might delete valid data
-- Uncomment only if you're sure about the data migration
-- DELETE FROM public.documents d
-- WHERE NOT EXISTS (
--     SELECT 1 FROM public.workspace_repos wr 
--     WHERE wr.id = d.repo_id
-- );

-- ============================================================================
-- 9. CREATE HELPER FUNCTION FOR GET_NEXT_DOCUMENT_VERSION (if missing)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_next_document_version(doc_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    next_version integer;
BEGIN
    SELECT COALESCE(MAX(version_number), 0) + 1
    INTO next_version
    FROM public.document_versions
    WHERE document_id = doc_id;
    
    RETURN next_version;
END;
$$;

-- ============================================================================
-- 10. CREATE HELPER FUNCTION FOR UPSERT_REPO_FILE_SUMMARY (if missing)
-- ============================================================================

-- Drop old function versions first to ensure clean replacement
DROP FUNCTION IF EXISTS public.upsert_repo_file_summary(
    text, text, text, text, jsonb, text, uuid, uuid, text
);

DROP FUNCTION IF EXISTS public.upsert_repo_file_summary(
    text, text, text, text, jsonb, text, uuid, text
);

CREATE OR REPLACE FUNCTION public.upsert_repo_file_summary(
    p_repo_id text,
    p_file_path text,
    p_file_hash text,
    p_summary_text text,
    p_summary_json jsonb,
    p_summary_model text,
    p_user_id uuid DEFAULT NULL,
    p_branch text DEFAULT 'main'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.repo_file_summaries (
        repo_id,
        file_path,
        file_hash,
        summary_text,
        summary_json,
        summary_model,
        branch,
        created_at,
        updated_at,
        last_regenerated
    )
    VALUES (
        p_repo_id,
        p_file_path,
        p_file_hash,
        p_summary_text,
        p_summary_json,
        p_summary_model,
        p_branch,
        NOW(),
        NOW(),
        NOW()
    )
    ON CONFLICT (repo_id, file_path, branch)
    DO UPDATE SET
        file_hash = EXCLUDED.file_hash,
        summary_text = EXCLUDED.summary_text,
        summary_json = EXCLUDED.summary_json,
        summary_model = EXCLUDED.summary_model,
        updated_at = NOW(),
        last_regenerated = NOW(),
        regeneration_reason = CASE 
            WHEN repo_file_summaries.file_hash != EXCLUDED.file_hash THEN 'file_changed'
            ELSE 'manual'
        END;
END;
$$;

-- ============================================================================
-- 11. ADD MISSING COLUMNS IF THEY DON'T EXIST
-- ============================================================================

-- Add updated_at to documents if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'documents' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.documents
        ADD COLUMN updated_at timestamp with time zone DEFAULT now();
    END IF;
END $$;

-- Add created_at to documents if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'documents' 
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE public.documents
        ADD COLUMN created_at timestamp with time zone DEFAULT now();
    END IF;
END $$;

-- ============================================================================
-- 12. CREATE TRIGGER FOR UPDATED_AT ON DOCUMENTS
-- ============================================================================

-- Create update_updated_at_column function if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Create trigger for documents.updated_at
DROP TRIGGER IF EXISTS update_documents_updated_at ON public.documents;
CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON public.documents
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (Run these after migration to verify)
-- ============================================================================

-- Check foreign key constraints
-- SELECT conname, conrelid::regclass, confrelid::regclass
-- FROM pg_constraint
-- WHERE contype = 'f'
-- AND conrelid::regclass::text LIKE '%document%'
-- ORDER BY conrelid::regclass::text;

-- Check indexes
-- SELECT indexname, tablename
-- FROM pg_indexes
-- WHERE schemaname = 'public'
-- AND tablename IN ('documents', 'document_files', 'document_versions')
-- ORDER BY tablename, indexname;

-- Check for orphaned records
-- SELECT COUNT(*) as orphaned_files
-- FROM document_files df
-- LEFT JOIN documents d ON d.id = df.document_id
-- WHERE d.id IS NULL;

-- SELECT COUNT(*) as orphaned_versions
-- FROM document_versions dv
-- LEFT JOIN documents d ON d.id = dv.document_id
-- WHERE d.id IS NULL;

