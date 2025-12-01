-- ============================================================================
-- Complete Schema Migration: Functions, Permissions, Constraints, and More
-- Date: 2025-01-02
-- Description: Comprehensive migration for new schema including:
--              - All database functions
--              - RLS policies for security
--              - Primary/foreign keys
--              - Indexes for performance
--              - Triggers for automation
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. DROP OLD FUNCTIONS THAT REFERENCE OLD TABLES
-- ============================================================================

-- Drop any old versions of upsert_repo_file_summary that might reference submissions
DROP FUNCTION IF EXISTS public.upsert_repo_file_summary(
    text, text, text, text, jsonb, text, uuid, uuid, text
);

DROP FUNCTION IF EXISTS public.upsert_repo_file_summary(
    text, text, text, text, jsonb, text, uuid, text
);

-- ============================================================================
-- 2. CREATE/UPDATE DATABASE FUNCTIONS
-- ============================================================================

-- Function: get_next_document_version
-- Purpose: Get the next version number for a document
CREATE OR REPLACE FUNCTION public.get_next_document_version(doc_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Function: upsert_repo_file_summary
-- Purpose: Upsert file summaries for repository files
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
SECURITY DEFINER
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

-- Function: update_updated_at_column
-- Purpose: Trigger function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ============================================================================
-- 3. ENSURE PRIMARY KEYS EXIST
-- ============================================================================

-- documents table should have id as primary key (usually already exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'documents_pkey'
    ) THEN
        ALTER TABLE public.documents
        ADD CONSTRAINT documents_pkey PRIMARY KEY (id);
    END IF;
END $$;

-- document_files should have composite primary key or unique constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'document_files_pkey'
        OR conname = 'document_files_document_id_file_path_key'
    ) THEN
        -- If no primary key exists, add unique constraint
        ALTER TABLE public.document_files
        ADD CONSTRAINT document_files_document_id_file_path_key
        UNIQUE (document_id, file_path);
    END IF;
END $$;

-- document_versions should have unique constraint on (document_id, version_number)
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

-- ============================================================================
-- 4. ENSURE FOREIGN KEYS EXIST
-- ============================================================================

-- documents.repo_id -> workspace_repos.id
DO $$
BEGIN
    -- Drop old constraint if it references wrong table
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'documents_repo_id_fkey'
        AND confrelid::regclass::text != 'workspace_repos'
    ) THEN
        ALTER TABLE public.documents 
        DROP CONSTRAINT documents_repo_id_fkey;
    END IF;
    
    -- Add correct constraint
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

-- document_files.document_id -> documents.id
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

-- document_versions.document_id -> documents.id
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

-- repository_setup.repo_id -> workspace_repos.id
DO $$
BEGIN
    -- Drop old constraint if it references wrong table
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'repository_setup_repo_id_fkey'
        AND confrelid::regclass::text != 'workspace_repos'
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

-- architecture_diagrams.repo_id -> workspace_repos.id
DO $$
BEGIN
    -- Drop old constraint if it references wrong table
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'architecture_diagrams_repo_id_fkey'
        AND confrelid::regclass::text != 'workspace_repos'
    ) THEN
        ALTER TABLE public.architecture_diagrams 
        DROP CONSTRAINT architecture_diagrams_repo_id_fkey;
    END IF;
    
    -- Add correct constraint
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
-- 5. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Documents table indexes
CREATE INDEX IF NOT EXISTS idx_documents_repo_id 
ON public.documents(repo_id);

CREATE INDEX IF NOT EXISTS idx_documents_created_at 
ON public.documents(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_documents_updated_at 
ON public.documents(updated_at DESC);

-- Document files indexes
CREATE INDEX IF NOT EXISTS idx_document_files_document_id 
ON public.document_files(document_id);

CREATE INDEX IF NOT EXISTS idx_document_files_file_path 
ON public.document_files(file_path);

CREATE INDEX IF NOT EXISTS idx_document_files_composite 
ON public.document_files(document_id, file_path);

-- Document versions indexes
CREATE INDEX IF NOT EXISTS idx_document_versions_document_id 
ON public.document_versions(document_id);

CREATE INDEX IF NOT EXISTS idx_document_versions_document_version 
ON public.document_versions(document_id, version_number DESC);

CREATE INDEX IF NOT EXISTS idx_document_versions_created_at 
ON public.document_versions(created_at DESC);

-- Repository setup indexes
CREATE INDEX IF NOT EXISTS idx_repository_setup_repo_id 
ON public.repository_setup(repo_id);

CREATE INDEX IF NOT EXISTS idx_repository_setup_status 
ON public.repository_setup(setup_status);

-- Repo file summaries indexes
CREATE INDEX IF NOT EXISTS idx_repo_file_summaries_repo_id 
ON public.repo_file_summaries(repo_id);

CREATE INDEX IF NOT EXISTS idx_repo_file_summaries_repo_hash 
ON public.repo_file_summaries(repo_id, file_hash);

CREATE INDEX IF NOT EXISTS idx_repo_file_summaries_file_path 
ON public.repo_file_summaries(file_path);

CREATE INDEX IF NOT EXISTS idx_repo_file_summaries_branch 
ON public.repo_file_summaries(repo_id, branch);

CREATE INDEX IF NOT EXISTS idx_repo_file_summaries_composite 
ON public.repo_file_summaries(repo_id, file_path, branch);

-- Workspace repos indexes
CREATE INDEX IF NOT EXISTS idx_workspace_repos_workspace_id 
ON public.workspace_repos(workspace_id);

CREATE INDEX IF NOT EXISTS idx_workspace_repos_repo_url 
ON public.workspace_repos(repo_url);

-- ============================================================================
-- 6. ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_repos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repository_setup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repo_file_summaries ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 7. CREATE RLS POLICIES
-- ============================================================================

-- Drop existing policies if they exist (to allow re-running migration)
DROP POLICY IF EXISTS "Users can view their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can insert their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can update their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can delete their own documents" ON public.documents;

DROP POLICY IF EXISTS "Users can view document files for their documents" ON public.document_files;
DROP POLICY IF EXISTS "Users can insert document files for their documents" ON public.document_files;
DROP POLICY IF EXISTS "Users can update document files for their documents" ON public.document_files;
DROP POLICY IF EXISTS "Users can delete document files for their documents" ON public.document_files;

DROP POLICY IF EXISTS "Users can view document versions for their documents" ON public.document_versions;
DROP POLICY IF EXISTS "Users can insert document versions for their documents" ON public.document_versions;

DROP POLICY IF EXISTS "Users can view their own workspace repos" ON public.workspace_repos;
DROP POLICY IF EXISTS "Users can insert their own workspace repos" ON public.workspace_repos;
DROP POLICY IF EXISTS "Users can update their own workspace repos" ON public.workspace_repos;
DROP POLICY IF EXISTS "Users can delete their own workspace repos" ON public.workspace_repos;

DROP POLICY IF EXISTS "Users can view repository setup for their repos" ON public.repository_setup;
DROP POLICY IF EXISTS "Users can insert repository setup for their repos" ON public.repository_setup;
DROP POLICY IF EXISTS "Users can update repository setup for their repos" ON public.repository_setup;

DROP POLICY IF EXISTS "Users can view file summaries for their repos" ON public.repo_file_summaries;
DROP POLICY IF EXISTS "Service role can manage file summaries" ON public.repo_file_summaries;

-- Documents policies
CREATE POLICY "Users can view their own documents"
ON public.documents FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.workspace_repos wr
        WHERE wr.id = documents.repo_id
        AND wr.workspace_id = auth.uid()
    )
);

CREATE POLICY "Users can insert their own documents"
ON public.documents FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.workspace_repos wr
        WHERE wr.id = documents.repo_id
        AND wr.workspace_id = auth.uid()
    )
);

CREATE POLICY "Users can update their own documents"
ON public.documents FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.workspace_repos wr
        WHERE wr.id = documents.repo_id
        AND wr.workspace_id = auth.uid()
    )
);

CREATE POLICY "Users can delete their own documents"
ON public.documents FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.workspace_repos wr
        WHERE wr.id = documents.repo_id
        AND wr.workspace_id = auth.uid()
    )
);

-- Document files policies
CREATE POLICY "Users can view document files for their documents"
ON public.document_files FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.documents d
        JOIN public.workspace_repos wr ON wr.id = d.repo_id
        WHERE d.id = document_files.document_id
        AND wr.workspace_id = auth.uid()
    )
);

CREATE POLICY "Users can insert document files for their documents"
ON public.document_files FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.documents d
        JOIN public.workspace_repos wr ON wr.id = d.repo_id
        WHERE d.id = document_files.document_id
        AND wr.workspace_id = auth.uid()
    )
);

CREATE POLICY "Users can update document files for their documents"
ON public.document_files FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.documents d
        JOIN public.workspace_repos wr ON wr.id = d.repo_id
        WHERE d.id = document_files.document_id
        AND wr.workspace_id = auth.uid()
    )
);

CREATE POLICY "Users can delete document files for their documents"
ON public.document_files FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.documents d
        JOIN public.workspace_repos wr ON wr.id = d.repo_id
        WHERE d.id = document_files.document_id
        AND wr.workspace_id = auth.uid()
    )
);

-- Document versions policies
CREATE POLICY "Users can view document versions for their documents"
ON public.document_versions FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.documents d
        JOIN public.workspace_repos wr ON wr.id = d.repo_id
        WHERE d.id = document_versions.document_id
        AND wr.workspace_id = auth.uid()
    )
);

CREATE POLICY "Users can insert document versions for their documents"
ON public.document_versions FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.documents d
        JOIN public.workspace_repos wr ON wr.id = d.repo_id
        WHERE d.id = document_versions.document_id
        AND wr.workspace_id = auth.uid()
    )
);

-- Workspace repos policies
CREATE POLICY "Users can view their own workspace repos"
ON public.workspace_repos FOR SELECT
USING (workspace_id = auth.uid());

CREATE POLICY "Users can insert their own workspace repos"
ON public.workspace_repos FOR INSERT
WITH CHECK (workspace_id = auth.uid());

CREATE POLICY "Users can update their own workspace repos"
ON public.workspace_repos FOR UPDATE
USING (workspace_id = auth.uid());

CREATE POLICY "Users can delete their own workspace repos"
ON public.workspace_repos FOR DELETE
USING (workspace_id = auth.uid());

-- Repository setup policies
CREATE POLICY "Users can view repository setup for their repos"
ON public.repository_setup FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.workspace_repos wr
        WHERE wr.id = repository_setup.repo_id
        AND wr.workspace_id = auth.uid()
    )
);

CREATE POLICY "Users can insert repository setup for their repos"
ON public.repository_setup FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.workspace_repos wr
        WHERE wr.id = repository_setup.repo_id
        AND wr.workspace_id = auth.uid()
    )
);

CREATE POLICY "Users can update repository setup for their repos"
ON public.repository_setup FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.workspace_repos wr
        WHERE wr.id = repository_setup.repo_id
        AND wr.workspace_id = auth.uid()
    )
);

-- Repo file summaries policies
-- Note: File summaries are typically managed by service role via RPC functions
-- But users should be able to read summaries for their repos
CREATE POLICY "Users can view file summaries for their repos"
ON public.repo_file_summaries FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.workspace_repos wr
        WHERE wr.repo_url LIKE '%' || repo_file_summaries.repo_id || '%'
        AND wr.workspace_id = auth.uid()
    )
);

-- Service role can manage file summaries (for RPC functions)
CREATE POLICY "Service role can manage file summaries"
ON public.repo_file_summaries
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- 8. CREATE TRIGGERS
-- ============================================================================

-- Trigger: Auto-update updated_at on documents
DROP TRIGGER IF EXISTS update_documents_updated_at ON public.documents;
CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON public.documents
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 9. ADD MISSING COLUMNS (if needed)
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
-- 10. DATA INTEGRITY CLEANUP
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
-- Note: Commented out to prevent accidental data loss
-- Uncomment only if you're sure about the data migration
-- DELETE FROM public.documents d
-- WHERE NOT EXISTS (
--     SELECT 1 FROM public.workspace_repos wr 
--     WHERE wr.id = d.repo_id
-- );

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (Run these after migration to verify)
-- ============================================================================

-- Check foreign key constraints
-- SELECT conname, conrelid::regclass, confrelid::regclass
-- FROM pg_constraint
-- WHERE contype = 'f'
-- AND conrelid::regclass::text IN ('documents', 'document_files', 'document_versions', 'repository_setup', 'architecture_diagrams')
-- ORDER BY conrelid::regclass::text;

-- Check indexes
-- SELECT indexname, tablename
-- FROM pg_indexes
-- WHERE schemaname = 'public'
-- AND tablename IN ('documents', 'document_files', 'document_versions', 'workspace_repos', 'repository_setup', 'repo_file_summaries')
-- ORDER BY tablename, indexname;

-- Check RLS policies
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- AND tablename IN ('documents', 'document_files', 'document_versions', 'workspace_repos', 'repository_setup', 'repo_file_summaries')
-- ORDER BY tablename, policyname;

-- Check functions
-- SELECT routine_name, routine_type
-- FROM information_schema.routines
-- WHERE routine_schema = 'public'
-- AND routine_name IN ('get_next_document_version', 'upsert_repo_file_summary', 'update_updated_at_column')
-- ORDER BY routine_name;

