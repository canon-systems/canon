-- Fix upsert_repo_file_summary function to remove any references to submissions table
-- This should be run if you're getting "relation 'submissions' does not exist" errors

BEGIN;

-- Drop the function if it exists (to ensure clean replacement)
DROP FUNCTION IF EXISTS public.upsert_repo_file_summary(
    text, text, text, text, jsonb, text, uuid, uuid, text
);

DROP FUNCTION IF EXISTS public.upsert_repo_file_summary(
    text, text, text, text, jsonb, text, uuid, text
);

-- Create the function without p_submission_id parameter
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

COMMIT;

