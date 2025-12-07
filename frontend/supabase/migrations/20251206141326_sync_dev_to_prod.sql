drop trigger if exists "update_automation_runs_updated_at" on "public"."automation_runs";

alter table "public"."automation_rules" drop column "last_commit_sha";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.update_oauth_connections_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.migrate_automation_runs()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
                    execution_record.executed_at,
                    COALESCE(execution_record.trigger_type, 'manual'),
                    execution_record.success,
                    COALESCE(execution_record.skipped, false),
                    execution_record.skip_reason,
                    CASE WHEN execution_record.actions IS NOT NULL THEN string_to_array(execution_record.actions, ',') ELSE '{}' END,
                    execution_record.doc_id,
                    execution_record.diagram_id,
                    execution_record.publish_status,
                    execution_record.publish_provider,
                    execution_record.publish_resource_id,
                    execution_record.errors
                );
                migrated_count := migrated_count + 1;
            END LOOP;
        END LOOP;
    END LOOP;

    -- Clean up old metadata (optional)
    -- UPDATE workspace_repos SET settings = settings - 'automation_metadata' WHERE settings->'automation_metadata' IS NOT NULL;

    RETURN migrated_count;
END;
$function$
;


  create policy "Users can update their own automation runs"
  on "public"."automation_runs"
  as permissive
  for update
  to public
using ((workspace_id = auth.uid()));



