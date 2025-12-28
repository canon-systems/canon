


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";






CREATE OR REPLACE FUNCTION "public"."cleanup_old_automation_runs"("days_to_keep" integer DEFAULT 90) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    deleted_count integer;
    cutoff_date timestamp with time zone;
BEGIN
    cutoff_date := NOW() - INTERVAL '1 day' * days_to_keep;

    DELETE FROM automation_runs
    WHERE executed_at < cutoff_date;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_old_automation_runs"("days_to_keep" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_next_run_at"("schedule_text" "text", "from_time" timestamp with time zone DEFAULT "now"()) RETURNS timestamp with time zone
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    result TIMESTAMPTZ;
BEGIN
    -- This would need to implement the same logic as calculateDelayUntilNextRun
    -- For now, return a default (this function would need to be implemented)
    RETURN from_time + interval '1 day';
END;
$$;


ALTER FUNCTION "public"."compute_next_run_at"("schedule_text" "text", "from_time" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_diagram_version"("p_diagram_id" "uuid", "p_diagram_markdown" "text", "p_commit_sha" "text" DEFAULT NULL::"text", "p_change_summary" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  version_num INTEGER;
  version_id UUID;
BEGIN
  version_num := get_next_diagram_version(p_diagram_id);
  
  INSERT INTO architecture_diagram_versions (diagram_id, version_number, diagram_markdown, commit_sha, change_summary)
  VALUES (p_diagram_id, version_num, p_diagram_markdown, p_commit_sha, p_change_summary)
  RETURNING id INTO version_id;
  
  RETURN version_id;
END;
$$;


ALTER FUNCTION "public"."create_diagram_version"("p_diagram_id" "uuid", "p_diagram_markdown" "text", "p_commit_sha" "text", "p_change_summary" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_document_version"("p_document_id" "uuid", "p_content" "text", "p_change_summary" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  version_num INTEGER;
  version_id UUID;
BEGIN
  version_num := get_next_document_version(p_document_id);
  
  INSERT INTO document_versions (document_id, version_number, content, change_summary)
  VALUES (p_document_id, version_num, p_content, p_change_summary)
  RETURNING id INTO version_id;
  
  RETURN version_id;
END;
$$;


ALTER FUNCTION "public"."create_document_version"("p_document_id" "uuid", "p_content" "text", "p_change_summary" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_repo_by_url"("repo_url_text" "text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  repo_uuid UUID;
BEGIN
  -- Try exact match first
  SELECT id INTO repo_uuid FROM repos WHERE repo_url = repo_url_text LIMIT 1;
  
  IF repo_uuid IS NULL THEN
    -- Try to find from workspace_repos if it exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workspace_repos') THEN
      SELECT id INTO repo_uuid 
      FROM workspace_repos 
      WHERE repo_url = repo_url_text 
      LIMIT 1;
    END IF;
  END IF;
  
  RETURN repo_uuid;
END;
$$;


ALTER FUNCTION "public"."find_repo_by_url"("repo_url_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_similar_chunks"("target_diagram_id" "uuid", "query_embedding" "public"."vector", "match_threshold" double precision DEFAULT 0.7, "match_count" integer DEFAULT 20) RETURNS TABLE("file_path" "text", "chunk_type" "text", "start_line" integer, "end_line" integer, "content" "text", "chunk_metadata" "jsonb", "similarity" double precision)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    files.file_path,
    files.chunk_type,
    files.start_line,
    files.end_line,
    files.content,
    files.chunk_metadata,
    1 - (files.embedding <=> query_embedding) AS similarity
  FROM architecture_diagram_files files
  WHERE files.diagram_id = target_diagram_id
    AND files.embedding IS NOT NULL
    AND 1 - (files.embedding <=> query_embedding) > match_threshold
  ORDER BY files.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;


ALTER FUNCTION "public"."find_similar_chunks"("target_diagram_id" "uuid", "query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_diagram_version"("diagram_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  next_version INTEGER;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO next_version
  FROM architecture_diagram_versions
  WHERE diagram_id = diagram_id;
  
  RETURN next_version;
END;
$$;


ALTER FUNCTION "public"."get_next_diagram_version"("diagram_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_document_version"("doc_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."get_next_document_version"("doc_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_repository_setup_with_relationships"("repo_id_param" "uuid") RETURNS TABLE("setup_status" "text", "total_files" integer, "summarized_files" integer, "setup_progress" numeric, "file_relationships" json, "recent_docs" json)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        rs.setup_status,
        rs.total_files,
        rs.summarized_files,
        CASE
            WHEN rs.total_files > 0 THEN (rs.summarized_files::DECIMAL / rs.total_files::DECIMAL) * 100
            ELSE 0
        END as setup_progress,
        COALESCE(
            json_agg(
                json_build_object(
                    'file_path', df.file_path,
                    'relationship_type', 'primary',
                    'doc_id', df.document_id
                )
            ) FILTER (WHERE df.document_id IS NOT NULL),
            '[]'::json
        ) as file_relationships,
        COALESCE(
            json_agg(
                json_build_object(
                    'doc_id', d.id,
                    'title', d.title,
                    'status', 'completed',
                    'created_at', d.created_at
                )
            ) FILTER (WHERE d.id IS NOT NULL),
            '[]'::json
        ) as recent_docs
    FROM repository_setup rs
    LEFT JOIN documents d ON rs.repo_id = d.repo_id
        AND d.created_at >= NOW() - INTERVAL '30 days'
    LEFT JOIN document_files df ON d.id = df.document_id
    WHERE rs.repo_id = repo_id_param
    GROUP BY rs.setup_status, rs.total_files, rs.summarized_files;
END;
$$;


ALTER FUNCTION "public"."get_repository_setup_with_relationships"("repo_id_param" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."migrate_automation_runs"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    repo_record RECORD;
    rule_record RECORD;
    execution_record RECORD;
    migrated_count integer := 0;
BEGIN
    -- Loop through all repos with automation metadata
    FOR repo_record IN
        SELECT id, workspace_id, settings
        FROM workspace_repos
        WHERE settings->'automation_metadata' IS NOT NULL
    LOOP
        -- Loop through each rule in the automation metadata
        FOR rule_record IN
            SELECT key as rule_id, value as rule_metadata
            FROM jsonb_object_keys(repo_record.settings->'automation_metadata') as rule_keys(key)
            CROSS JOIN jsonb_extract_path(repo_record.settings->'automation_metadata', rule_keys.key) as rule_metadata(value)
        LOOP
            -- Loop through execution history for each rule
            FOR execution_record IN
                SELECT
                    (value->>'timestamp')::timestamp with time zone as executed_at,
                    (value->>'success')::boolean as success,
                    (value->>'skipped')::boolean as skipped,
                    value->>'skip_reason' as skip_reason,
                    value->>'actions' as actions,
                    (value->>'doc_id')::uuid as doc_id,
                    (value->>'diagram_id')::uuid as diagram_id,
                    value->>'publish_status' as publish_status,
                    value->>'publish_provider' as publish_provider,
                    value->>'publish_resource_id' as publish_resource_id,
                    value->>'trigger' as trigger_type,
                    value->'errors' as errors
                FROM jsonb_array_elements(rule_record.rule_metadata->'execution_history')
            LOOP
                -- Insert into new table
                INSERT INTO automation_runs (
                    repo_id,
                    rule_id,
                    workspace_id,
                    executed_at,
                    trigger_type,
                    success,
                    skipped,
                    skip_reason,
                    actions,
                    doc_id,
                    diagram_id,
                    publish_status,
                    publish_provider,
                    publish_resource_id,
                    errors
                ) VALUES (
                    repo_record.id,
                    rule_record.rule_id,
                    repo_record.workspace_id,
                    COALESCE(execution_record.executed_at, now()),
                    COALESCE(execution_record.trigger_type, 'scheduled'),
                    COALESCE(execution_record.success, false),
                    COALESCE(execution_record.skipped, false),
                    execution_record.skip_reason,
                    CASE
                        WHEN jsonb_typeof(execution_record.actions) = 'array'
                        THEN ARRAY(SELECT jsonb_array_elements_text(execution_record.actions))
                        ELSE '{}'::text[]
                    END,
                    execution_record.doc_id,
                    execution_record.diagram_id,
                    execution_record.publish_status,
                    execution_record.publish_provider,
                    execution_record.publish_resource_id,
                    COALESCE(execution_record.errors, '[]'::jsonb)
                );

                migrated_count := migrated_count + 1;
            END LOOP;
        END LOOP;
    END LOOP;

    RETURN migrated_count;
END;
$$;


ALTER FUNCTION "public"."migrate_automation_runs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_repo_url_to_id"("repo_url" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  match_result TEXT[];
BEGIN
  -- Extract github.com/owner/repo from various URL formats
  -- Handles: https://github.com/owner/repo, https://github.com/owner/repo.git, etc.
  -- Pattern matches: github.com/owner/repo or github.com:owner/repo
  match_result := regexp_match(repo_url, 'github\.com[/:]([^/]+)/([^/\.]+)', 'i');
  
  IF match_result IS NOT NULL AND array_length(match_result, 1) >= 3 THEN
    RETURN 'github.com/' || match_result[1] || '/' || match_result[2];
  END IF;
  
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."normalize_repo_url_to_id"("repo_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."schema_with_samples"("sample_size" integer DEFAULT 3) RETURNS TABLE("table_schema" "text", "table_name" "text", "column_name" "text", "data_type" "text", "is_nullable" "text", "column_default" "text", "sample_values" "jsonb")
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  r RECORD;
  sql TEXT;
  samples JSONB;
BEGIN
  FOR r IN
    SELECT
      c.table_schema,
      c.table_name,
      c.column_name,
      c.data_type,
      c.is_nullable,
      c.column_default
    FROM information_schema.columns c
    WHERE c.table_schema NOT IN (
      'pg_catalog',
      'information_schema',
      'storage',
      'supabase_migrations'
    )
    AND c.table_name = ANY(ARRAY[
      'dependency_registry',
      'endpoint_registry',
      'service_boundary_overrides',
      'relationship_rules'
    ]::text[])
    ORDER BY c.table_schema, c.table_name, c.ordinal_position
  LOOP
    sql := format(
      'SELECT jsonb_agg(val) FROM (
         SELECT to_jsonb(%I) AS val
         FROM %I.%I
         WHERE %I IS NOT NULL
         LIMIT %s
       ) t',
      r.column_name,
      r.table_schema,
      r.table_name,
      r.column_name,
      sample_size
    );

    BEGIN
      EXECUTE sql INTO samples;

      RETURN QUERY
      SELECT
        r.table_schema::text,
        r.table_name::text,
        r.column_name::text,
        r.data_type::text,
        r.is_nullable::text,
        r.column_default::text,
        samples;
    EXCEPTION WHEN others THEN
      RETURN QUERY
      SELECT
        r.table_schema::text,
        r.table_name::text,
        r.column_name::text,
        r.data_type::text,
        r.is_nullable::text,
        r.column_default::text,
        NULL::jsonb;
    END;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."schema_with_samples"("sample_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_automation_rule_next_run"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.schedule IS NOT NULL AND NEW.enabled = true THEN
        NEW.next_run_at := compute_next_run_at(NEW.schedule, COALESCE(NEW.last_run_at, now()));
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_automation_rule_next_run"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_repo_file_summaries_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_repo_file_summaries_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_repo_file_summary"("p_repo_id" "text", "p_file_path" "text", "p_file_hash" "text", "p_summary_text" "text", "p_summary_model" "text", "p_user_id" "uuid", "p_branch" "text" DEFAULT 'main'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    result_id uuid;
BEGIN
    -- Insert or update the record
    INSERT INTO public.repo_file_summaries (
        repo_id,
        file_path,
        file_hash,
        summary_text,
        summary_model,
        branch
    ) VALUES (
        p_repo_id,
        p_file_path,
        p_file_hash,
        p_summary_text,
        p_summary_model,
        COALESCE(p_branch, 'main')
    )
    ON CONFLICT (repo_id, file_path, branch) 
    DO UPDATE SET
        file_hash = EXCLUDED.file_hash,
        summary_text = EXCLUDED.summary_text,
        summary_model = EXCLUDED.summary_model,
        updated_at = now(),
        last_regenerated = now(),
        regeneration_reason = 'file_changed'
    WHERE repo_file_summaries.file_hash != EXCLUDED.file_hash
       OR repo_file_summaries.summary_text != EXCLUDED.summary_text
       OR repo_file_summaries.summary_model != EXCLUDED.summary_model
    RETURNING id INTO result_id;
    
    -- If no row was updated (no changes), just return the existing id
    IF result_id IS NULL THEN
        SELECT id INTO result_id 
        FROM public.repo_file_summaries 
        WHERE repo_id = p_repo_id 
          AND file_path = p_file_path 
          AND branch = COALESCE(p_branch, 'main');
    END IF;
    
    RETURN result_id;
END;
$$;


ALTER FUNCTION "public"."upsert_repo_file_summary"("p_repo_id" "text", "p_file_path" "text", "p_file_hash" "text", "p_summary_text" "text", "p_summary_model" "text", "p_user_id" "uuid", "p_branch" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_owns_repo"("repo_id_to_check" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  current_user_id UUID;
BEGIN
  -- Get current user ID - try multiple methods for compatibility
  current_user_id := auth.uid();
  
  -- If auth.uid() is null, try to get from JWT claims
  IF current_user_id IS NULL THEN
    BEGIN
      current_user_id := (current_setting('request.jwt.claims', true)::json->>'sub')::uuid;
    EXCEPTION
      WHEN OTHERS THEN
        current_user_id := NULL;
    END;
  END IF;

  -- If still no user ID, deny access
  IF current_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if repo is in workspace_repos
  IF EXISTS (
    SELECT 1
    FROM workspace_repos
    WHERE workspace_id = current_user_id
      AND normalize_repo_url_to_id(repo_url) = repo_id_to_check
  ) THEN
    RETURN TRUE;
  END IF;

  -- Removed submissions check - users now only access repos via workspace_repos
  -- If you need to check documents, you can add:
  -- IF EXISTS (
  --   SELECT 1
  --   FROM documents d
  --   JOIN workspace_repos wr ON wr.id = d.repo_id
  --   WHERE wr.workspace_id = current_user_id
  --     AND normalize_repo_url_to_id(wr.repo_url) = repo_id_to_check
  -- ) THEN
  --   RETURN TRUE;
  -- END IF;

  RETURN FALSE;
END;
$$;


ALTER FUNCTION "public"."user_owns_repo"("repo_id_to_check" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."automation_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rule_id" "text" NOT NULL,
    "repo_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "significance_analysis" "jsonb",
    "generated_documents" "jsonb" DEFAULT '[]'::"jsonb",
    "generated_diagrams" "jsonb" DEFAULT '[]'::"jsonb",
    "actions_taken" "jsonb" DEFAULT '[]'::"jsonb",
    "errors" "jsonb" DEFAULT '[]'::"jsonb",
    "preview_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."automation_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."automation_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "repo_id" "uuid" NOT NULL,
    "rule_id" "text" NOT NULL,
    "name" "text",
    "enabled" boolean DEFAULT true,
    "schedule" "text",
    "action_preset" "text",
    "significance_analysis" "jsonb" DEFAULT '{"sensitivity": "balanced", "minimum_confidence": "medium", "require_business_changes": false, "require_technical_changes": false}'::"jsonb" NOT NULL,
    "target_documents" "text"[] DEFAULT '{}'::"text"[],
    "target_diagrams" "text"[] DEFAULT '{}'::"text"[],
    "notifications" "jsonb" DEFAULT '{"email_enabled": true, "include_preview_links": true}'::"jsonb" NOT NULL,
    "publish_targets" "jsonb" DEFAULT 'null'::"jsonb",
    "next_run_at" timestamp with time zone,
    "last_run_at" timestamp with time zone,
    "last_run_status" "text",
    "last_run_error" "text",
    "generate_doc" boolean DEFAULT false,
    "generate_diagram" boolean DEFAULT false,
    "auto_publish" boolean DEFAULT false,
    "auto_publish_new_docs" boolean DEFAULT false,
    "auto_publish_max_changes" integer,
    "auto_publish_max_change_percentage" numeric(5,2),
    "auto_publish_target" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_commit_sha" "text" DEFAULT ''::"text" NOT NULL,
    CONSTRAINT "automation_rules_action_preset_check" CHECK (("action_preset" = ANY (ARRAY['docs_only'::"text", 'diagrams_only'::"text", 'docs_and_diagrams'::"text", 'full_auto_publish'::"text"])))
);


ALTER TABLE "public"."automation_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."automation_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "repo_id" "uuid" NOT NULL,
    "rule_id" "text" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "executed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "trigger_type" "text" DEFAULT 'scheduled'::"text",
    "success" boolean NOT NULL,
    "skipped" boolean DEFAULT false,
    "skip_reason" "text",
    "actions" "text"[] DEFAULT '{}'::"text"[],
    "doc_id" "uuid",
    "diagram_id" "uuid",
    "publish_status" "text",
    "publish_provider" "text",
    "publish_resource_id" "text",
    "execution_time_ms" integer,
    "files_processed" integer DEFAULT 0,
    "documents_updated" integer DEFAULT 0,
    "errors" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "automation_runs_trigger_type_check" CHECK (("trigger_type" = ANY (ARRAY['manual'::"text", 'scheduled'::"text"])))
);


ALTER TABLE "public"."automation_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."diagrams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "repo_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "diagram_type" "text" DEFAULT 'architecture'::"text" NOT NULL,
    "content" "text" NOT NULL,
    "format" "text" DEFAULT 'mermaid'::"text" NOT NULL,
    "analysis_data" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."diagrams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_files" (
    "document_id" "uuid" NOT NULL,
    "file_path" "text" NOT NULL
);


ALTER TABLE "public"."document_files" OWNER TO "postgres";


COMMENT ON TABLE "public"."document_files" IS 'Mapping of which files are included in each document';



CREATE TABLE IF NOT EXISTS "public"."document_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid",
    "version_number" integer NOT NULL,
    "content" "text" NOT NULL,
    "change_summary" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."document_versions" OWNER TO "postgres";


COMMENT ON TABLE "public"."document_versions" IS 'Version history for documents';



CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "repo_id" "uuid",
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "kb_id" "text",
    "kb_provider" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "configuration" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


COMMENT ON TABLE "public"."documents" IS 'Generated documentation from file summaries';



COMMENT ON COLUMN "public"."documents"."configuration" IS 'What personality and sections went into creating the documentation';



CREATE TABLE IF NOT EXISTS "public"."system_nodes" (
    "id" "text" NOT NULL,
    "label" "text" NOT NULL,
    "category" "text" NOT NULL,
    "package_names" "text"[] DEFAULT '{}'::"text"[],
    "package_prefixes" "text"[] DEFAULT '{}'::"text"[],
    "enabled" boolean DEFAULT true,
    "priority" integer DEFAULT 100,
    "needs_review" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."system_nodes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."oauth_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "connection_id" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."oauth_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."repo_file_summaries" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "repo_id" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_hash" "text" NOT NULL,
    "summary_text" "text" NOT NULL,
    "summary_model" "text" NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "branch" "text",
    "last_regenerated" timestamp with time zone DEFAULT "now"(),
    "regeneration_reason" "text" DEFAULT 'initial'::"text",
    CONSTRAINT "repo_file_summaries_regeneration_reason_check" CHECK (("regeneration_reason" = ANY (ARRAY['initial'::"text", 'file_changed'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."repo_file_summaries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."repository_setup" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "repo_id" "uuid" NOT NULL,
    "setup_status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "total_files" integer DEFAULT 0,
    "summarized_files" integer DEFAULT 0,
    "setup_started_at" timestamp with time zone DEFAULT "now"(),
    "setup_completed_at" timestamp with time zone,
    "last_analyzed" timestamp with time zone,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "branch" "text" NOT NULL,
    "current_file" "text",
    "processing_status" "text",
    "progress_percentage" numeric,
    "processing_rate" numeric,
    "estimated_time_remaining" numeric,
    "recent_files" "text",
    "last_progress_update" timestamp with time zone,
    CONSTRAINT "repository_setup_setup_status_check" CHECK (("setup_status" = ANY (ARRAY['not_started'::"text", 'analyzing'::"text", 'summaries_generated'::"text", 'ready'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."repository_setup" OWNER TO "postgres";


COMMENT ON COLUMN "public"."repository_setup"."current_file" IS 'Path of the file currently being processed';



COMMENT ON COLUMN "public"."repository_setup"."processing_status" IS 'Current processing status: starting, scanning, ai-processing, completing';



COMMENT ON COLUMN "public"."repository_setup"."progress_percentage" IS 'Progress percentage (0-100)';



COMMENT ON COLUMN "public"."repository_setup"."processing_rate" IS 'Files processed per minute';



COMMENT ON COLUMN "public"."repository_setup"."estimated_time_remaining" IS 'Estimated time remaining in minutes';



COMMENT ON COLUMN "public"."repository_setup"."recent_files" IS 'JSON array of recently processed files with status and timestamps';



COMMENT ON COLUMN "public"."repository_setup"."last_progress_update" IS 'Timestamp of the last progress update';



CREATE TABLE IF NOT EXISTS "public"."usage_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."usage_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_repos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "provider" "text" DEFAULT 'github'::"text" NOT NULL,
    "repo_url" "text" NOT NULL,
    "default_branch" "text" DEFAULT 'main'::"text" NOT NULL,
    "auth_type" "text" DEFAULT 'github_pat'::"text" NOT NULL,
    "credentials_ref" "text",
    "settings" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."workspace_repos" OWNER TO "postgres";


ALTER TABLE ONLY "public"."automation_results"
    ADD CONSTRAINT "automation_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."automation_rules"
    ADD CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."automation_rules"
    ADD CONSTRAINT "automation_rules_workspace_id_repo_id_rule_id_key" UNIQUE ("workspace_id", "repo_id", "rule_id");



ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."diagrams"
    ADD CONSTRAINT "diagrams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_files"
    ADD CONSTRAINT "document_files_document_id_file_path_key" UNIQUE ("document_id", "file_path");



ALTER TABLE ONLY "public"."document_files"
    ADD CONSTRAINT "document_files_pkey" PRIMARY KEY ("document_id", "file_path");



ALTER TABLE ONLY "public"."document_versions"
    ADD CONSTRAINT "document_versions_document_id_version_number_key" UNIQUE ("document_id", "version_number");



ALTER TABLE ONLY "public"."document_versions"
    ADD CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_nodes"
    ADD CONSTRAINT "system_nodes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."oauth_connections"
    ADD CONSTRAINT "oauth_connections_connection_id_key" UNIQUE ("connection_id");



ALTER TABLE ONLY "public"."oauth_connections"
    ADD CONSTRAINT "oauth_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."oauth_connections"
    ADD CONSTRAINT "oauth_connections_user_id_provider_key" UNIQUE ("user_id", "provider");



ALTER TABLE ONLY "public"."repo_file_summaries"
    ADD CONSTRAINT "repo_file_summaries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."repo_file_summaries"
    ADD CONSTRAINT "repo_file_summaries_repo_id_file_path_branch_key" UNIQUE ("repo_id", "file_path", "branch");



ALTER TABLE ONLY "public"."repository_setup"
    ADD CONSTRAINT "repository_setup_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."repository_setup"
    ADD CONSTRAINT "repository_setup_repo_id_key" UNIQUE ("repo_id");



ALTER TABLE ONLY "public"."usage_events"
    ADD CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_repos"
    ADD CONSTRAINT "workspace_repos_pkey" PRIMARY KEY ("id");



CREATE INDEX "automation_results_created_at_idx" ON "public"."automation_results" USING "btree" ("created_at");



CREATE INDEX "automation_results_repo_id_idx" ON "public"."automation_results" USING "btree" ("repo_id");



CREATE INDEX "automation_results_rule_id_idx" ON "public"."automation_results" USING "btree" ("rule_id");



CREATE INDEX "automation_results_user_id_idx" ON "public"."automation_results" USING "btree" ("user_id");



CREATE INDEX "system_nodes_enabled_idx" ON "public"."system_nodes" USING "btree" ("enabled");



CREATE INDEX "idx_automation_rules_due" ON "public"."automation_rules" USING "btree" ("next_run_at") WHERE ("enabled" = true);



CREATE INDEX "idx_automation_rules_enabled_next_run" ON "public"."automation_rules" USING "btree" ("enabled", "next_run_at") WHERE ("enabled" = true);



CREATE INDEX "idx_automation_rules_workspace_enabled" ON "public"."automation_rules" USING "btree" ("workspace_id", "enabled");



CREATE INDEX "idx_automation_rules_workspace_repo" ON "public"."automation_rules" USING "btree" ("workspace_id", "repo_id");



CREATE INDEX "idx_automation_runs_executed_at" ON "public"."automation_runs" USING "btree" ("executed_at" DESC);



CREATE INDEX "idx_automation_runs_repo_id_executed_at" ON "public"."automation_runs" USING "btree" ("repo_id", "executed_at" DESC);



CREATE INDEX "idx_automation_runs_rule_id_executed_at" ON "public"."automation_runs" USING "btree" ("rule_id", "executed_at" DESC);



CREATE INDEX "idx_automation_runs_trigger_type" ON "public"."automation_runs" USING "btree" ("trigger_type");



CREATE INDEX "idx_automation_runs_workspace_id_executed_at" ON "public"."automation_runs" USING "btree" ("workspace_id", "executed_at" DESC);



CREATE INDEX "idx_diagrams_created_at" ON "public"."diagrams" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_diagrams_repo_id" ON "public"."diagrams" USING "btree" ("repo_id");



CREATE INDEX "idx_document_files_composite" ON "public"."document_files" USING "btree" ("document_id", "file_path");



CREATE INDEX "idx_document_files_document_id" ON "public"."document_files" USING "btree" ("document_id");



CREATE INDEX "idx_document_files_file_path" ON "public"."document_files" USING "btree" ("file_path");



CREATE INDEX "idx_document_versions_created_at" ON "public"."document_versions" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_document_versions_document_id" ON "public"."document_versions" USING "btree" ("document_id");



CREATE INDEX "idx_document_versions_document_version" ON "public"."document_versions" USING "btree" ("document_id", "version_number" DESC);



CREATE INDEX "idx_document_versions_version" ON "public"."document_versions" USING "btree" ("document_id", "version_number" DESC);



CREATE INDEX "idx_documents_created_at" ON "public"."documents" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_documents_kb_id" ON "public"."documents" USING "btree" ("kb_id");



CREATE INDEX "idx_documents_repo_id" ON "public"."documents" USING "btree" ("repo_id");



CREATE INDEX "idx_documents_updated_at" ON "public"."documents" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_repo_file_summaries_branch" ON "public"."repo_file_summaries" USING "btree" ("repo_id", "branch");



CREATE INDEX "idx_repo_file_summaries_composite" ON "public"."repo_file_summaries" USING "btree" ("repo_id", "file_path", "branch");



CREATE INDEX "idx_repo_file_summaries_file_path" ON "public"."repo_file_summaries" USING "btree" ("file_path");



CREATE INDEX "idx_repo_file_summaries_repo_hash" ON "public"."repo_file_summaries" USING "btree" ("repo_id", "file_hash");



CREATE INDEX "idx_repo_file_summaries_repo_id" ON "public"."repo_file_summaries" USING "btree" ("repo_id");



CREATE INDEX "idx_repository_setup_repo_id" ON "public"."repository_setup" USING "btree" ("repo_id");



CREATE INDEX "idx_repository_setup_status" ON "public"."repository_setup" USING "btree" ("setup_status");



CREATE INDEX "idx_usage_events_created_at" ON "public"."usage_events" USING "btree" ("created_at");



CREATE INDEX "idx_usage_events_event_type" ON "public"."usage_events" USING "btree" ("event_type");



CREATE INDEX "idx_usage_events_workspace_id" ON "public"."usage_events" USING "btree" ("workspace_id");



CREATE INDEX "idx_usage_events_workspace_type" ON "public"."usage_events" USING "btree" ("workspace_id", "event_type");



CREATE INDEX "idx_workspace_repos_repo_url" ON "public"."workspace_repos" USING "btree" ("repo_url");



CREATE INDEX "idx_workspace_repos_workspace_id" ON "public"."workspace_repos" USING "btree" ("workspace_id");



CREATE INDEX "oauth_connections_provider_idx" ON "public"."oauth_connections" USING "btree" ("provider");



CREATE INDEX "oauth_connections_user_id_idx" ON "public"."oauth_connections" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "trigger_update_automation_rule_next_run" BEFORE INSERT OR UPDATE ON "public"."automation_rules" FOR EACH ROW EXECUTE FUNCTION "public"."update_automation_rule_next_run"();



CREATE OR REPLACE TRIGGER "trigger_update_repo_file_summaries_updated_at" BEFORE UPDATE ON "public"."repo_file_summaries" FOR EACH ROW EXECUTE FUNCTION "public"."update_repo_file_summaries_updated_at"();



CREATE OR REPLACE TRIGGER "update_automation_runs_updated_at" BEFORE UPDATE ON "public"."automation_runs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_documents_updated_at" BEFORE UPDATE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_repository_setup_updated_at" BEFORE UPDATE ON "public"."repository_setup" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."automation_results"
    ADD CONSTRAINT "automation_results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_rules"
    ADD CONSTRAINT "automation_rules_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "public"."workspace_repos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_rules"
    ADD CONSTRAINT "automation_rules_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "public"."workspace_repos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."diagrams"
    ADD CONSTRAINT "diagrams_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "public"."workspace_repos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_files"
    ADD CONSTRAINT "document_files_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_versions"
    ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_repo_id_workspace_repos_fkey" FOREIGN KEY ("repo_id") REFERENCES "public"."workspace_repos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usage_events"
    ADD CONSTRAINT "fk_workspace" FOREIGN KEY ("workspace_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_repos"
    ADD CONSTRAINT "fk_workspace" FOREIGN KEY ("workspace_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."oauth_connections"
    ADD CONSTRAINT "oauth_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."repository_setup"
    ADD CONSTRAINT "repository_setup_repo_id_workspace_repos_fkey" FOREIGN KEY ("repo_id") REFERENCES "public"."workspace_repos"("id") ON DELETE CASCADE;



CREATE POLICY "Service can insert events" ON "public"."usage_events" FOR INSERT WITH CHECK (true);



CREATE POLICY "Service role can manage automation runs" ON "public"."automation_runs" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage file summaries" ON "public"."repo_file_summaries" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "User can access everything" ON "public"."workspace_repos" USING (("workspace_id" = "auth"."uid"())) WITH CHECK (("workspace_id" = "auth"."uid"()));



CREATE POLICY "User full permissions" ON "public"."oauth_connections" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create diagrams for their repos" ON "public"."diagrams" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."workspace_repos"
  WHERE (("workspace_repos"."id" = "diagrams"."repo_id") AND ("workspace_repos"."workspace_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete document files for their documents" ON "public"."document_files" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."documents" "d"
     JOIN "public"."workspace_repos" "wr" ON (("wr"."id" = "d"."repo_id")))
  WHERE (("d"."id" = "document_files"."document_id") AND ("wr"."workspace_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete their own automation results" ON "public"."automation_results" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can delete their own automation rules" ON "public"."automation_rules" FOR DELETE USING (("workspace_id" = "auth"."uid"()));



CREATE POLICY "Users can delete their own diagrams" ON "public"."diagrams" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_repos"
  WHERE (("workspace_repos"."id" = "diagrams"."repo_id") AND ("workspace_repos"."workspace_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete their own documents" ON "public"."documents" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_repos" "wr"
  WHERE (("wr"."id" = "documents"."repo_id") AND ("wr"."workspace_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete their own repo file summaries" ON "public"."repo_file_summaries" FOR DELETE USING ("public"."user_owns_repo"("repo_id"));



CREATE POLICY "Users can delete their own workspace repos" ON "public"."workspace_repos" FOR DELETE USING (("workspace_id" = "auth"."uid"()));



CREATE POLICY "Users can insert document files for their documents" ON "public"."document_files" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."documents" "d"
     JOIN "public"."workspace_repos" "wr" ON (("wr"."id" = "d"."repo_id")))
  WHERE (("d"."id" = "document_files"."document_id") AND ("wr"."workspace_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert document versions for their documents" ON "public"."document_versions" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."documents" "d"
     JOIN "public"."workspace_repos" "wr" ON (("wr"."id" = "d"."repo_id")))
  WHERE (("d"."id" = "document_versions"."document_id") AND ("wr"."workspace_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert repository setup for their repos" ON "public"."repository_setup" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."workspace_repos" "wr"
  WHERE (("wr"."id" = "repository_setup"."repo_id") AND ("wr"."workspace_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert their own automation results" ON "public"."automation_results" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert their own automation rules" ON "public"."automation_rules" FOR INSERT WITH CHECK (("workspace_id" = "auth"."uid"()));



CREATE POLICY "Users can insert their own automation runs" ON "public"."automation_runs" FOR INSERT WITH CHECK (("workspace_id" = "auth"."uid"()));



CREATE POLICY "Users can insert their own documents" ON "public"."documents" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."workspace_repos" "wr"
  WHERE (("wr"."id" = "documents"."repo_id") AND ("wr"."workspace_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert their own repo file summaries" ON "public"."repo_file_summaries" FOR INSERT WITH CHECK ("public"."user_owns_repo"("repo_id"));



CREATE POLICY "Users can insert their own repository setup" ON "public"."repository_setup" FOR INSERT WITH CHECK (("repo_id" IN ( SELECT "workspace_repos"."id"
   FROM "public"."workspace_repos"
  WHERE ("workspace_repos"."workspace_id" = "auth"."uid"()))));



CREATE POLICY "Users can insert their own workspace repos" ON "public"."workspace_repos" FOR INSERT WITH CHECK (("workspace_id" = "auth"."uid"()));



CREATE POLICY "Users can update document files for their documents" ON "public"."document_files" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."documents" "d"
     JOIN "public"."workspace_repos" "wr" ON (("wr"."id" = "d"."repo_id")))
  WHERE (("d"."id" = "document_files"."document_id") AND ("wr"."workspace_id" = "auth"."uid"())))));



CREATE POLICY "Users can update repository setup for their repos" ON "public"."repository_setup" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_repos" "wr"
  WHERE (("wr"."id" = "repository_setup"."repo_id") AND ("wr"."workspace_id" = "auth"."uid"())))));



CREATE POLICY "Users can update their own automation results" ON "public"."automation_results" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own automation rules" ON "public"."automation_rules" FOR UPDATE USING (("workspace_id" = "auth"."uid"())) WITH CHECK (("workspace_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own diagrams" ON "public"."diagrams" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_repos"
  WHERE (("workspace_repos"."id" = "diagrams"."repo_id") AND ("workspace_repos"."workspace_id" = "auth"."uid"())))));



CREATE POLICY "Users can update their own documents" ON "public"."documents" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_repos" "wr"
  WHERE (("wr"."id" = "documents"."repo_id") AND ("wr"."workspace_id" = "auth"."uid"())))));



CREATE POLICY "Users can update their own repo file summaries" ON "public"."repo_file_summaries" FOR UPDATE USING ("public"."user_owns_repo"("repo_id")) WITH CHECK ("public"."user_owns_repo"("repo_id"));



CREATE POLICY "Users can update their own repository setup" ON "public"."repository_setup" FOR UPDATE USING (("repo_id" IN ( SELECT "workspace_repos"."id"
   FROM "public"."workspace_repos"
  WHERE ("workspace_repos"."workspace_id" = "auth"."uid"()))));



CREATE POLICY "Users can update their own workspace repos" ON "public"."workspace_repos" FOR UPDATE USING (("workspace_id" = "auth"."uid"()));



CREATE POLICY "Users can view document files for their documents" ON "public"."document_files" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."documents" "d"
     JOIN "public"."workspace_repos" "wr" ON (("wr"."id" = "d"."repo_id")))
  WHERE (("d"."id" = "document_files"."document_id") AND ("wr"."workspace_id" = "auth"."uid"())))));



CREATE POLICY "Users can view document versions for their documents" ON "public"."document_versions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."documents" "d"
     JOIN "public"."workspace_repos" "wr" ON (("wr"."id" = "d"."repo_id")))
  WHERE (("d"."id" = "document_versions"."document_id") AND ("wr"."workspace_id" = "auth"."uid"())))));



CREATE POLICY "Users can view file summaries for their repos" ON "public"."repo_file_summaries" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_repos" "wr"
  WHERE (("wr"."repo_url" ~~ (('%'::"text" || "repo_file_summaries"."repo_id") || '%'::"text")) AND ("wr"."workspace_id" = "auth"."uid"())))));



CREATE POLICY "Users can view repository setup for their repos" ON "public"."repository_setup" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_repos" "wr"
  WHERE (("wr"."id" = "repository_setup"."repo_id") AND ("wr"."workspace_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their own automation results" ON "public"."automation_results" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own automation rules" ON "public"."automation_rules" FOR SELECT USING (("workspace_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own automation runs" ON "public"."automation_runs" FOR SELECT USING (("workspace_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own diagrams" ON "public"."diagrams" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_repos"
  WHERE (("workspace_repos"."id" = "diagrams"."repo_id") AND ("workspace_repos"."workspace_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their own documents" ON "public"."documents" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_repos" "wr"
  WHERE (("wr"."id" = "documents"."repo_id") AND ("wr"."workspace_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their own events" ON "public"."usage_events" FOR SELECT USING (("workspace_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own repo file summaries" ON "public"."repo_file_summaries" FOR SELECT USING ("public"."user_owns_repo"("repo_id"));



CREATE POLICY "Users can view their own repository setup" ON "public"."repository_setup" FOR SELECT USING (("repo_id" IN ( SELECT "workspace_repos"."id"
   FROM "public"."workspace_repos"
  WHERE ("workspace_repos"."workspace_id" = "auth"."uid"()))));



CREATE POLICY "Users can view their own workspace repos" ON "public"."workspace_repos" FOR SELECT USING (("workspace_id" = "auth"."uid"()));



ALTER TABLE "public"."automation_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."automation_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."automation_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."diagrams" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_files" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."oauth_connections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."repo_file_summaries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."repository_setup" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usage_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspace_repos" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "service_role";














































































































































































GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_old_automation_runs"("days_to_keep" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_automation_runs"("days_to_keep" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_automation_runs"("days_to_keep" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."compute_next_run_at"("schedule_text" "text", "from_time" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."compute_next_run_at"("schedule_text" "text", "from_time" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_next_run_at"("schedule_text" "text", "from_time" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_diagram_version"("p_diagram_id" "uuid", "p_diagram_markdown" "text", "p_commit_sha" "text", "p_change_summary" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_diagram_version"("p_diagram_id" "uuid", "p_diagram_markdown" "text", "p_commit_sha" "text", "p_change_summary" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_diagram_version"("p_diagram_id" "uuid", "p_diagram_markdown" "text", "p_commit_sha" "text", "p_change_summary" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_document_version"("p_document_id" "uuid", "p_content" "text", "p_change_summary" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_document_version"("p_document_id" "uuid", "p_content" "text", "p_change_summary" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_document_version"("p_document_id" "uuid", "p_content" "text", "p_change_summary" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."find_repo_by_url"("repo_url_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."find_repo_by_url"("repo_url_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_repo_by_url"("repo_url_text" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."find_similar_chunks"("target_diagram_id" "uuid", "query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."find_similar_chunks"("target_diagram_id" "uuid", "query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_similar_chunks"("target_diagram_id" "uuid", "query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_diagram_version"("diagram_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_diagram_version"("diagram_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_diagram_version"("diagram_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_document_version"("doc_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_document_version"("doc_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_document_version"("doc_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_repository_setup_with_relationships"("repo_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_repository_setup_with_relationships"("repo_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_repository_setup_with_relationships"("repo_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "postgres";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "anon";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "authenticated";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "postgres";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "anon";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "authenticated";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."migrate_automation_runs"() TO "anon";
GRANT ALL ON FUNCTION "public"."migrate_automation_runs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."migrate_automation_runs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_repo_url_to_id"("repo_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_repo_url_to_id"("repo_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_repo_url_to_id"("repo_url" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."schema_with_samples"("sample_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."schema_with_samples"("sample_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."schema_with_samples"("sample_size" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_automation_rule_next_run"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_automation_rule_next_run"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_automation_rule_next_run"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_repo_file_summaries_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_repo_file_summaries_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_repo_file_summaries_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_repo_file_summary"("p_repo_id" "text", "p_file_path" "text", "p_file_hash" "text", "p_summary_text" "text", "p_summary_model" "text", "p_user_id" "uuid", "p_branch" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_repo_file_summary"("p_repo_id" "text", "p_file_path" "text", "p_file_hash" "text", "p_summary_text" "text", "p_summary_model" "text", "p_user_id" "uuid", "p_branch" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_repo_file_summary"("p_repo_id" "text", "p_file_path" "text", "p_file_hash" "text", "p_summary_text" "text", "p_summary_model" "text", "p_user_id" "uuid", "p_branch" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_owns_repo"("repo_id_to_check" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."user_owns_repo"("repo_id_to_check" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_owns_repo"("repo_id_to_check" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "service_role";












GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "service_role";















GRANT ALL ON TABLE "public"."automation_results" TO "anon";
GRANT ALL ON TABLE "public"."automation_results" TO "authenticated";
GRANT ALL ON TABLE "public"."automation_results" TO "service_role";



GRANT ALL ON TABLE "public"."automation_rules" TO "anon";
GRANT ALL ON TABLE "public"."automation_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."automation_rules" TO "service_role";



GRANT ALL ON TABLE "public"."automation_runs" TO "anon";
GRANT ALL ON TABLE "public"."automation_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."automation_runs" TO "service_role";



GRANT ALL ON TABLE "public"."diagrams" TO "anon";
GRANT ALL ON TABLE "public"."diagrams" TO "authenticated";
GRANT ALL ON TABLE "public"."diagrams" TO "service_role";



GRANT ALL ON TABLE "public"."document_files" TO "anon";
GRANT ALL ON TABLE "public"."document_files" TO "authenticated";
GRANT ALL ON TABLE "public"."document_files" TO "service_role";



GRANT ALL ON TABLE "public"."document_versions" TO "anon";
GRANT ALL ON TABLE "public"."document_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."document_versions" TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON TABLE "public"."system_nodes" TO "anon";
GRANT ALL ON TABLE "public"."system_nodes" TO "authenticated";
GRANT ALL ON TABLE "public"."system_nodes" TO "service_role";



GRANT ALL ON TABLE "public"."oauth_connections" TO "anon";
GRANT ALL ON TABLE "public"."oauth_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."oauth_connections" TO "service_role";



GRANT ALL ON TABLE "public"."repo_file_summaries" TO "anon";
GRANT ALL ON TABLE "public"."repo_file_summaries" TO "authenticated";
GRANT ALL ON TABLE "public"."repo_file_summaries" TO "service_role";



GRANT ALL ON TABLE "public"."repository_setup" TO "anon";
GRANT ALL ON TABLE "public"."repository_setup" TO "authenticated";
GRANT ALL ON TABLE "public"."repository_setup" TO "service_role";



GRANT ALL ON TABLE "public"."usage_events" TO "anon";
GRANT ALL ON TABLE "public"."usage_events" TO "authenticated";
GRANT ALL ON TABLE "public"."usage_events" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_repos" TO "anon";
GRANT ALL ON TABLE "public"."workspace_repos" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_repos" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";


