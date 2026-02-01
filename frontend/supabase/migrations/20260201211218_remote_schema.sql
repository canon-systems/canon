create type "public"."report_schedule_type" as enum ('diff', 'projection');

drop trigger if exists "update_documents_updated_at" on "public"."documents";

drop trigger if exists "update_repository_setup_updated_at" on "public"."repository_setup";

drop policy if exists "Users can delete their own automation rules" on "public"."automation_rules";

drop policy if exists "Users can insert their own automation rules" on "public"."automation_rules";

drop policy if exists "Users can update their own automation rules" on "public"."automation_rules";

drop policy if exists "Users can view their own automation rules" on "public"."automation_rules";

drop policy if exists "Service role can manage automation runs" on "public"."automation_runs";

drop policy if exists "Users can insert their own automation runs" on "public"."automation_runs";

drop policy if exists "Users can view their own automation runs" on "public"."automation_runs";

drop policy if exists "Users can delete document files for their documents" on "public"."document_files";

drop policy if exists "Users can insert document files for their documents" on "public"."document_files";

drop policy if exists "Users can update document files for their documents" on "public"."document_files";

drop policy if exists "Users can view document files for their documents" on "public"."document_files";

drop policy if exists "Users can insert document versions for their documents" on "public"."document_versions";

drop policy if exists "Users can view document versions for their documents" on "public"."document_versions";

drop policy if exists "Users can delete their own documents" on "public"."documents";

drop policy if exists "Users can insert their own documents" on "public"."documents";

drop policy if exists "Users can update their own documents" on "public"."documents";

drop policy if exists "Users can view their own documents" on "public"."documents";

drop policy if exists "Users can delete their own repo file summaries" on "public"."repo_file_summaries";

drop policy if exists "Users can insert their own repo file summaries" on "public"."repo_file_summaries";

drop policy if exists "Users can update their own repo file summaries" on "public"."repo_file_summaries";

drop policy if exists "Users can view file summaries for their repos" on "public"."repo_file_summaries";

drop policy if exists "Users can view their own repo file summaries" on "public"."repo_file_summaries";

drop policy if exists "Users can insert repository setup for their repos" on "public"."repository_setup";

drop policy if exists "Users can insert their own repository setup" on "public"."repository_setup";

drop policy if exists "Users can update repository setup for their repos" on "public"."repository_setup";

drop policy if exists "Users can update their own repository setup" on "public"."repository_setup";

drop policy if exists "Users can view repository setup for their repos" on "public"."repository_setup";

drop policy if exists "Users can view their own repository setup" on "public"."repository_setup";

drop policy if exists "User can access everything" on "public"."workspace_repos";

drop policy if exists "Users can delete their own workspace repos" on "public"."workspace_repos";

drop policy if exists "Users can insert their own workspace repos" on "public"."workspace_repos";

drop policy if exists "Users can update their own workspace repos" on "public"."workspace_repos";

drop policy if exists "Users can view their own workspace repos" on "public"."workspace_repos";

drop policy if exists "Users can create diagrams for their repos" on "public"."diagrams";

drop policy if exists "Users can delete their own diagrams" on "public"."diagrams";

drop policy if exists "Users can update their own diagrams" on "public"."diagrams";

drop policy if exists "Users can view their own diagrams" on "public"."diagrams";

revoke delete on table "public"."automation_rules" from "anon";

revoke insert on table "public"."automation_rules" from "anon";

revoke references on table "public"."automation_rules" from "anon";

revoke select on table "public"."automation_rules" from "anon";

revoke trigger on table "public"."automation_rules" from "anon";

revoke truncate on table "public"."automation_rules" from "anon";

revoke update on table "public"."automation_rules" from "anon";

revoke delete on table "public"."automation_rules" from "authenticated";

revoke insert on table "public"."automation_rules" from "authenticated";

revoke references on table "public"."automation_rules" from "authenticated";

revoke select on table "public"."automation_rules" from "authenticated";

revoke trigger on table "public"."automation_rules" from "authenticated";

revoke truncate on table "public"."automation_rules" from "authenticated";

revoke update on table "public"."automation_rules" from "authenticated";

revoke delete on table "public"."automation_rules" from "service_role";

revoke insert on table "public"."automation_rules" from "service_role";

revoke references on table "public"."automation_rules" from "service_role";

revoke select on table "public"."automation_rules" from "service_role";

revoke trigger on table "public"."automation_rules" from "service_role";

revoke truncate on table "public"."automation_rules" from "service_role";

revoke update on table "public"."automation_rules" from "service_role";

revoke delete on table "public"."automation_runs" from "anon";

revoke insert on table "public"."automation_runs" from "anon";

revoke references on table "public"."automation_runs" from "anon";

revoke select on table "public"."automation_runs" from "anon";

revoke trigger on table "public"."automation_runs" from "anon";

revoke truncate on table "public"."automation_runs" from "anon";

revoke update on table "public"."automation_runs" from "anon";

revoke delete on table "public"."automation_runs" from "authenticated";

revoke insert on table "public"."automation_runs" from "authenticated";

revoke references on table "public"."automation_runs" from "authenticated";

revoke select on table "public"."automation_runs" from "authenticated";

revoke trigger on table "public"."automation_runs" from "authenticated";

revoke truncate on table "public"."automation_runs" from "authenticated";

revoke update on table "public"."automation_runs" from "authenticated";

revoke delete on table "public"."automation_runs" from "service_role";

revoke insert on table "public"."automation_runs" from "service_role";

revoke references on table "public"."automation_runs" from "service_role";

revoke select on table "public"."automation_runs" from "service_role";

revoke trigger on table "public"."automation_runs" from "service_role";

revoke truncate on table "public"."automation_runs" from "service_role";

revoke update on table "public"."automation_runs" from "service_role";

revoke delete on table "public"."document_files" from "anon";

revoke insert on table "public"."document_files" from "anon";

revoke references on table "public"."document_files" from "anon";

revoke select on table "public"."document_files" from "anon";

revoke trigger on table "public"."document_files" from "anon";

revoke truncate on table "public"."document_files" from "anon";

revoke update on table "public"."document_files" from "anon";

revoke delete on table "public"."document_files" from "authenticated";

revoke insert on table "public"."document_files" from "authenticated";

revoke references on table "public"."document_files" from "authenticated";

revoke select on table "public"."document_files" from "authenticated";

revoke trigger on table "public"."document_files" from "authenticated";

revoke truncate on table "public"."document_files" from "authenticated";

revoke update on table "public"."document_files" from "authenticated";

revoke delete on table "public"."document_files" from "service_role";

revoke insert on table "public"."document_files" from "service_role";

revoke references on table "public"."document_files" from "service_role";

revoke select on table "public"."document_files" from "service_role";

revoke trigger on table "public"."document_files" from "service_role";

revoke truncate on table "public"."document_files" from "service_role";

revoke update on table "public"."document_files" from "service_role";

revoke delete on table "public"."document_versions" from "anon";

revoke insert on table "public"."document_versions" from "anon";

revoke references on table "public"."document_versions" from "anon";

revoke select on table "public"."document_versions" from "anon";

revoke trigger on table "public"."document_versions" from "anon";

revoke truncate on table "public"."document_versions" from "anon";

revoke update on table "public"."document_versions" from "anon";

revoke delete on table "public"."document_versions" from "authenticated";

revoke insert on table "public"."document_versions" from "authenticated";

revoke references on table "public"."document_versions" from "authenticated";

revoke select on table "public"."document_versions" from "authenticated";

revoke trigger on table "public"."document_versions" from "authenticated";

revoke truncate on table "public"."document_versions" from "authenticated";

revoke update on table "public"."document_versions" from "authenticated";

revoke delete on table "public"."document_versions" from "service_role";

revoke insert on table "public"."document_versions" from "service_role";

revoke references on table "public"."document_versions" from "service_role";

revoke select on table "public"."document_versions" from "service_role";

revoke trigger on table "public"."document_versions" from "service_role";

revoke truncate on table "public"."document_versions" from "service_role";

revoke update on table "public"."document_versions" from "service_role";

revoke delete on table "public"."documents" from "anon";

revoke insert on table "public"."documents" from "anon";

revoke references on table "public"."documents" from "anon";

revoke select on table "public"."documents" from "anon";

revoke trigger on table "public"."documents" from "anon";

revoke truncate on table "public"."documents" from "anon";

revoke update on table "public"."documents" from "anon";

revoke delete on table "public"."documents" from "authenticated";

revoke insert on table "public"."documents" from "authenticated";

revoke references on table "public"."documents" from "authenticated";

revoke select on table "public"."documents" from "authenticated";

revoke trigger on table "public"."documents" from "authenticated";

revoke truncate on table "public"."documents" from "authenticated";

revoke update on table "public"."documents" from "authenticated";

revoke delete on table "public"."documents" from "service_role";

revoke insert on table "public"."documents" from "service_role";

revoke references on table "public"."documents" from "service_role";

revoke select on table "public"."documents" from "service_role";

revoke trigger on table "public"."documents" from "service_role";

revoke truncate on table "public"."documents" from "service_role";

revoke update on table "public"."documents" from "service_role";

revoke delete on table "public"."repository_setup" from "anon";

revoke insert on table "public"."repository_setup" from "anon";

revoke references on table "public"."repository_setup" from "anon";

revoke select on table "public"."repository_setup" from "anon";

revoke trigger on table "public"."repository_setup" from "anon";

revoke truncate on table "public"."repository_setup" from "anon";

revoke update on table "public"."repository_setup" from "anon";

revoke delete on table "public"."repository_setup" from "authenticated";

revoke insert on table "public"."repository_setup" from "authenticated";

revoke references on table "public"."repository_setup" from "authenticated";

revoke select on table "public"."repository_setup" from "authenticated";

revoke trigger on table "public"."repository_setup" from "authenticated";

revoke truncate on table "public"."repository_setup" from "authenticated";

revoke update on table "public"."repository_setup" from "authenticated";

revoke delete on table "public"."repository_setup" from "service_role";

revoke insert on table "public"."repository_setup" from "service_role";

revoke references on table "public"."repository_setup" from "service_role";

revoke select on table "public"."repository_setup" from "service_role";

revoke trigger on table "public"."repository_setup" from "service_role";

revoke truncate on table "public"."repository_setup" from "service_role";

revoke update on table "public"."repository_setup" from "service_role";

revoke delete on table "public"."workspace_repos" from "anon";

revoke insert on table "public"."workspace_repos" from "anon";

revoke references on table "public"."workspace_repos" from "anon";

revoke select on table "public"."workspace_repos" from "anon";

revoke trigger on table "public"."workspace_repos" from "anon";

revoke truncate on table "public"."workspace_repos" from "anon";

revoke update on table "public"."workspace_repos" from "anon";

revoke delete on table "public"."workspace_repos" from "authenticated";

revoke insert on table "public"."workspace_repos" from "authenticated";

revoke references on table "public"."workspace_repos" from "authenticated";

revoke select on table "public"."workspace_repos" from "authenticated";

revoke trigger on table "public"."workspace_repos" from "authenticated";

revoke truncate on table "public"."workspace_repos" from "authenticated";

revoke update on table "public"."workspace_repos" from "authenticated";

revoke delete on table "public"."workspace_repos" from "service_role";

revoke insert on table "public"."workspace_repos" from "service_role";

revoke references on table "public"."workspace_repos" from "service_role";

revoke select on table "public"."workspace_repos" from "service_role";

revoke trigger on table "public"."workspace_repos" from "service_role";

revoke truncate on table "public"."workspace_repos" from "service_role";

revoke update on table "public"."workspace_repos" from "service_role";

alter table "public"."automation_rules" drop constraint if exists "automation_rules_repo_id_fkey";

alter table "public"."automation_rules" drop constraint if exists "automation_rules_user_id_repo_id_key";

alter table "public"."automation_rules" drop constraint if exists "automation_rules_workspace_id_fkey";

alter table "public"."automation_runs" drop constraint if exists "automation_runs_automation_rule_id_fkey";

alter table "public"."automation_runs" drop constraint if exists "automation_runs_repo_id_fkey";

alter table "public"."automation_runs" drop constraint if exists "automation_runs_status_check";

alter table "public"."automation_runs" drop constraint if exists "automation_runs_trigger_type_check";

alter table "public"."automation_runs" drop constraint if exists "automation_runs_workspace_id_fkey";

alter table "public"."diagrams" drop constraint if exists "diagrams_repo_id_fkey";

alter table "public"."document_files" drop constraint if exists "document_files_document_id_file_path_key";

alter table "public"."document_files" drop constraint if exists "document_files_document_id_fkey";

alter table "public"."document_versions" drop constraint if exists "document_versions_document_id_fkey";

alter table "public"."document_versions" drop constraint if exists "document_versions_document_id_version_number_key";

alter table "public"."repo_file_summaries" drop constraint if exists "repo_file_summaries_repo_id_file_path_branch_key";

alter table "public"."repository_setup" drop constraint if exists "repository_setup_repo_id_key";

alter table "public"."repository_setup" drop constraint if exists "repository_setup_repo_id_workspace_repos_fkey";

alter table "public"."repository_setup" drop constraint if exists "repository_setup_setup_status_check";

alter table "public"."workspace_repos" drop constraint if exists "fk_workspace";

drop function if exists "public"."cleanup_old_automation_runs"(days_to_keep integer);

drop function if exists "public"."create_document_version"(p_document_id uuid, p_content text, p_change_summary text);

drop function if exists "public"."get_next_document_version"(doc_id uuid);

drop function if exists "public"."get_repository_setup_with_relationships"(repo_id_param uuid);

drop function if exists "public"."migrate_automation_runs"();

alter table "public"."automation_rules" drop constraint if exists "automation_rules_pkey";

alter table "public"."automation_runs" drop constraint if exists "automation_runs_pkey";

alter table "public"."document_files" drop constraint if exists "document_files_pkey";

alter table "public"."document_versions" drop constraint if exists "document_versions_pkey";

alter table "public"."documents" drop constraint if exists "documents_pkey";

alter table "public"."repository_setup" drop constraint if exists "repository_setup_pkey";

alter table "public"."workspace_repos" drop constraint if exists "workspace_repos_pkey";

drop index if exists "public"."automation_rules_pkey";

drop index if exists "public"."automation_rules_user_id_repo_id_key";

drop index if exists "public"."automation_runs_pkey";

drop index if exists "public"."document_files_document_id_file_path_key";

drop index if exists "public"."document_files_pkey";

drop index if exists "public"."document_versions_document_id_version_number_key";

drop index if exists "public"."document_versions_pkey";

drop index if exists "public"."documents_pkey";

drop index if exists "public"."idx_automation_rules_workspace_enabled";

drop index if exists "public"."idx_automation_rules_workspace_repo";

drop index if exists "public"."idx_automation_runs_automation_rule_id_executed_at";

drop index if exists "public"."idx_automation_runs_executed_at";

drop index if exists "public"."idx_automation_runs_repo_id_executed_at";

drop index if exists "public"."idx_automation_runs_trigger_type";

drop index if exists "public"."idx_automation_runs_workspace_id_executed_at";

drop index if exists "public"."idx_document_files_composite";

drop index if exists "public"."idx_document_files_document_id";

drop index if exists "public"."idx_document_files_file_path";

drop index if exists "public"."idx_document_versions_created_at";

drop index if exists "public"."idx_document_versions_document_id";

drop index if exists "public"."idx_document_versions_document_status";

drop index if exists "public"."idx_document_versions_document_version";

drop index if exists "public"."idx_document_versions_version";

drop index if exists "public"."idx_documents_created_at";

drop index if exists "public"."idx_documents_kb_id";

drop index if exists "public"."idx_documents_updated_at";

drop index if exists "public"."idx_repo_file_summaries_branch";

drop index if exists "public"."idx_repo_file_summaries_composite";

drop index if exists "public"."idx_repo_file_summaries_repo_hash";

drop index if exists "public"."idx_repo_file_summaries_repo_id";

drop index if exists "public"."idx_repository_setup_repo_id";

drop index if exists "public"."idx_repository_setup_status";

drop index if exists "public"."idx_workspace_repos_repo_url";

drop index if exists "public"."repo_file_summaries_repo_id_file_path_branch_key";

drop index if exists "public"."repository_setup_pkey";

drop index if exists "public"."repository_setup_repo_id_key";

drop index if exists "public"."idx_diagrams_repo_id";

drop index if exists "public"."idx_workspace_repos_user_id";

drop index if exists "public"."workspace_repos_pkey";

drop table "public"."automation_rules";

drop table "public"."automation_runs";

drop table "public"."document_files";

drop table "public"."document_versions";

drop table "public"."documents";

drop table "public"."repository_setup";

drop table "public"."workspace_repos";


  create table "public"."akus" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "title" text not null,
    "body" text not null,
    "type" text not null default 'code_summary'::text,
    "source_ids" uuid[] not null default '{}'::uuid[],
    "scope_refs" text[] not null default '{}'::text[],
    "hash" text not null,
    "status" text not null default 'draft'::text,
    "scores" jsonb not null default '{}'::jsonb,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."akus" enable row level security;


  create table "public"."audience_views" (
    "id" uuid not null default gen_random_uuid(),
    "aku_id" uuid not null,
    "user_id" uuid not null,
    "audience" text not null,
    "projection" text not null,
    "summary" text,
    "status" text not null default 'draft'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."audience_views" enable row level security;


  create table "public"."issue_index" (
    "id" uuid not null default gen_random_uuid(),
    "source_id" uuid not null,
    "provider" text not null,
    "issue_id" text not null,
    "issue_key" text not null,
    "title" text not null,
    "status" text not null,
    "status_category" text,
    "type" text,
    "priority" text,
    "assignee" text,
    "reporter" text,
    "labels" text[] default '{}'::text[],
    "project" text,
    "story_points" numeric,
    "created_at" timestamp with time zone not null,
    "updated_at" timestamp with time zone not null,
    "last_synced_at" timestamp with time zone not null default now(),
    "raw" jsonb default '{}'::jsonb
      );


alter table "public"."issue_index" enable row level security;


  create table "public"."knowledge_pushes" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "provider" text not null,
    "entity_type" text not null,
    "aku_id" uuid not null,
    "audience" text not null default ''::text,
    "title" text,
    "resource_id" text,
    "parent_resource_id" text,
    "content_hash" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."knowledge_pushes" enable row level security;


  create table "public"."report_schedule_runs" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "report_schedule_id" uuid not null,
    "executed_at" timestamp with time zone not null default now(),
    "trigger_type" text not null default 'scheduled'::text,
    "status" text not null,
    "execution_time_ms" integer,
    "errors" jsonb not null default '[]'::jsonb,
    "result_summary" jsonb,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."report_schedule_runs" enable row level security;


  create table "public"."report_schedules" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "type" public.report_schedule_type not null,
    "name" text,
    "enabled" boolean not null default true,
    "cadence" text not null,
    "source_ids" uuid[] not null default '{}'::uuid[],
    "communication" jsonb not null default '{}'::jsonb,
    "audiences" text[] not null default '{}'::text[],
    "units" text[] not null default '{}'::text[],
    "last_run_at" timestamp with time zone,
    "last_run_status" text,
    "last_run_error" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "run_at_time" text,
    "run_at_timezone" text,
    "run_at_weekday" smallint,
    "run_at_month_day" smallint,
    "rrule" text,
    "dtstart" timestamp with time zone,
    "next_run_at" timestamp with time zone
      );


alter table "public"."report_schedules" enable row level security;


  create table "public"."workspace_sources" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "name" text not null,
    "provider" text not null default 'github'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "source_type" text default 'code'::text,
    "external_url" text,
    "scope" jsonb not null default '{}'::jsonb,
    "connection_id" uuid not null,
    "last_error" text,
    "status_payload" jsonb not null default '{}'::jsonb
      );


alter table "public"."workspace_sources" enable row level security;

alter table "public"."diagrams" drop column if exists "repo_id";

alter table "public"."diagrams" add column if not exists "source_id" uuid;

alter table "public"."diagrams" add column if not exists "source_repo_ids" uuid[] not null default '{}'::uuid[];

alter table "public"."repo_file_summaries" drop column if exists "repo_id";

alter table "public"."repo_file_summaries" add column if not exists "source_id" uuid;

alter table "public"."repo_file_summaries" alter column "source_key" set not null;

CREATE UNIQUE INDEX akus_hash_key ON public.akus USING btree (hash);

CREATE UNIQUE INDEX akus_pkey ON public.akus USING btree (id);

CREATE UNIQUE INDEX audience_views_aku_audience_key ON public.audience_views USING btree (aku_id, audience);

CREATE UNIQUE INDEX audience_views_pkey ON public.audience_views USING btree (id);

CREATE INDEX idx_repo_file_summaries_source_id ON public.repo_file_summaries USING btree (source_id);

CREATE INDEX idx_report_schedule_runs_executed_at ON public.report_schedule_runs USING btree (executed_at DESC);

CREATE INDEX idx_report_schedule_runs_schedule_executed ON public.report_schedule_runs USING btree (report_schedule_id, executed_at DESC);

CREATE INDEX idx_report_schedule_runs_user_executed ON public.report_schedule_runs USING btree (user_id, executed_at DESC);

CREATE INDEX idx_report_schedules_user_enabled ON public.report_schedules USING btree (user_id, enabled);

CREATE INDEX idx_report_schedules_user_id ON public.report_schedules USING btree (user_id);

CREATE INDEX idx_report_schedules_user_type ON public.report_schedules USING btree (user_id, type);

CREATE INDEX idx_workspace_sources_connection_id ON public.workspace_sources USING btree (connection_id);

CREATE INDEX idx_workspace_sources_provider ON public.workspace_sources USING btree (provider);

CREATE INDEX idx_workspace_sources_scope_gin ON public.workspace_sources USING gin (scope jsonb_path_ops);

CREATE INDEX issue_index_labels_gin ON public.issue_index USING gin (labels);

CREATE UNIQUE INDEX issue_index_pkey ON public.issue_index USING btree (id);

CREATE UNIQUE INDEX issue_index_source_key_unique ON public.issue_index USING btree (source_id, issue_key);

CREATE INDEX issue_index_source_provider_status ON public.issue_index USING btree (source_id, provider, status);

CREATE INDEX issue_index_source_updated_desc ON public.issue_index USING btree (source_id, updated_at DESC);

CREATE UNIQUE INDEX knowledge_pushes_pkey ON public.knowledge_pushes USING btree (id);

CREATE UNIQUE INDEX knowledge_pushes_uniq ON public.knowledge_pushes USING btree (user_id, provider, entity_type, aku_id, audience);

CREATE UNIQUE INDEX repo_file_summaries_source_id_file_path_branch_key ON public.repo_file_summaries USING btree (source_id, file_path, branch);

CREATE UNIQUE INDEX report_schedule_runs_pkey ON public.report_schedule_runs USING btree (id);

CREATE UNIQUE INDEX report_schedules_pkey ON public.report_schedules USING btree (id);

CREATE INDEX idx_diagrams_repo_id ON public.diagrams USING btree (source_id);

CREATE INDEX idx_workspace_repos_user_id ON public.workspace_sources USING btree (user_id);

CREATE UNIQUE INDEX workspace_repos_pkey ON public.workspace_sources USING btree (id);

alter table "public"."akus" add constraint "akus_pkey" PRIMARY KEY using index "akus_pkey";

alter table "public"."audience_views" add constraint "audience_views_pkey" PRIMARY KEY using index "audience_views_pkey";

alter table "public"."issue_index" add constraint "issue_index_pkey" PRIMARY KEY using index "issue_index_pkey";

alter table "public"."knowledge_pushes" add constraint "knowledge_pushes_pkey" PRIMARY KEY using index "knowledge_pushes_pkey";

alter table "public"."report_schedule_runs" add constraint "report_schedule_runs_pkey" PRIMARY KEY using index "report_schedule_runs_pkey";

alter table "public"."report_schedules" add constraint "report_schedules_pkey" PRIMARY KEY using index "report_schedules_pkey";

alter table "public"."workspace_sources" add constraint "workspace_repos_pkey" PRIMARY KEY using index "workspace_repos_pkey";

alter table "public"."akus" add constraint "akus_hash_key" UNIQUE using index "akus_hash_key";

alter table "public"."akus" add constraint "akus_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."akus" validate constraint "akus_user_id_fkey";

alter table "public"."audience_views" add constraint "audience_views_aku_audience_key" UNIQUE using index "audience_views_aku_audience_key";

alter table "public"."audience_views" add constraint "audience_views_aku_id_fkey" FOREIGN KEY (aku_id) REFERENCES public.akus(id) ON DELETE CASCADE not valid;

alter table "public"."audience_views" validate constraint "audience_views_aku_id_fkey";

alter table "public"."audience_views" add constraint "audience_views_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."audience_views" validate constraint "audience_views_user_id_fkey";

alter table "public"."diagrams" add constraint "diagrams_source_id_fkey" FOREIGN KEY (source_id) REFERENCES public.workspace_sources(id) ON DELETE CASCADE not valid;

alter table "public"."diagrams" validate constraint "diagrams_source_id_fkey";

alter table "public"."issue_index" add constraint "issue_index_source_id_fkey" FOREIGN KEY (source_id) REFERENCES public.workspace_sources(id) ON DELETE CASCADE not valid;

alter table "public"."issue_index" validate constraint "issue_index_source_id_fkey";

alter table "public"."knowledge_pushes" add constraint "knowledge_pushes_aku_fk" FOREIGN KEY (aku_id) REFERENCES public.akus(id) ON DELETE CASCADE not valid;

alter table "public"."knowledge_pushes" validate constraint "knowledge_pushes_aku_fk";

alter table "public"."knowledge_pushes" add constraint "knowledge_pushes_entity_type_check" CHECK ((entity_type = ANY (ARRAY['system'::text, 'aku'::text, 'audience'::text]))) not valid;

alter table "public"."knowledge_pushes" validate constraint "knowledge_pushes_entity_type_check";

alter table "public"."repo_file_summaries" add constraint "repo_file_summaries_source_id_file_path_branch_key" UNIQUE using index "repo_file_summaries_source_id_file_path_branch_key";

alter table "public"."repo_file_summaries" add constraint "repo_file_summaries_source_id_fkey" FOREIGN KEY (source_id) REFERENCES public.workspace_sources(id) ON DELETE CASCADE not valid;

alter table "public"."repo_file_summaries" validate constraint "repo_file_summaries_source_id_fkey";

alter table "public"."report_schedule_runs" add constraint "report_schedule_runs_report_schedule_id_fkey" FOREIGN KEY (report_schedule_id) REFERENCES public.report_schedules(id) ON DELETE CASCADE not valid;

alter table "public"."report_schedule_runs" validate constraint "report_schedule_runs_report_schedule_id_fkey";

alter table "public"."report_schedule_runs" add constraint "report_schedule_runs_status_check" CHECK ((status = ANY (ARRAY['succeeded'::text, 'failed'::text, 'skipped'::text]))) not valid;

alter table "public"."report_schedule_runs" validate constraint "report_schedule_runs_status_check";

alter table "public"."report_schedule_runs" add constraint "report_schedule_runs_trigger_type_check" CHECK ((trigger_type = ANY (ARRAY['manual'::text, 'scheduled'::text]))) not valid;

alter table "public"."report_schedule_runs" validate constraint "report_schedule_runs_trigger_type_check";

alter table "public"."report_schedule_runs" add constraint "report_schedule_runs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."report_schedule_runs" validate constraint "report_schedule_runs_user_id_fkey";

alter table "public"."report_schedules" add constraint "report_schedules_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."report_schedules" validate constraint "report_schedules_user_id_fkey";

alter table "public"."workspace_sources" add constraint "fk_workspace" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."workspace_sources" validate constraint "fk_workspace";

alter table "public"."workspace_sources" add constraint "workspace_sources_connection_id_fkey" FOREIGN KEY (connection_id) REFERENCES public.oauth_connections(id) not valid;

alter table "public"."workspace_sources" validate constraint "workspace_sources_connection_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public._matches_repo_id(ws jsonb, r text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select
    coalesce(ws->>'repo','') ilike r
    or concat('github.com/', coalesce(ws->>'repo','')) ilike r
    or replace(r, 'github.com/', '') ilike coalesce(ws->>'repo','');
$function$
;

CREATE OR REPLACE FUNCTION public.delete_akus_for_source()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  delete from public.akus where source_ids @> array[old.id]::uuid[];
  return null;
end;
$function$
;

grant delete on table "public"."akus" to "anon";

grant insert on table "public"."akus" to "anon";

grant references on table "public"."akus" to "anon";

grant select on table "public"."akus" to "anon";

grant trigger on table "public"."akus" to "anon";

grant truncate on table "public"."akus" to "anon";

grant update on table "public"."akus" to "anon";

grant delete on table "public"."akus" to "authenticated";

grant insert on table "public"."akus" to "authenticated";

grant references on table "public"."akus" to "authenticated";

grant select on table "public"."akus" to "authenticated";

grant trigger on table "public"."akus" to "authenticated";

grant truncate on table "public"."akus" to "authenticated";

grant update on table "public"."akus" to "authenticated";

grant delete on table "public"."akus" to "service_role";

grant insert on table "public"."akus" to "service_role";

grant references on table "public"."akus" to "service_role";

grant select on table "public"."akus" to "service_role";

grant trigger on table "public"."akus" to "service_role";

grant truncate on table "public"."akus" to "service_role";

grant update on table "public"."akus" to "service_role";

grant delete on table "public"."audience_views" to "anon";

grant insert on table "public"."audience_views" to "anon";

grant references on table "public"."audience_views" to "anon";

grant select on table "public"."audience_views" to "anon";

grant trigger on table "public"."audience_views" to "anon";

grant truncate on table "public"."audience_views" to "anon";

grant update on table "public"."audience_views" to "anon";

grant delete on table "public"."audience_views" to "authenticated";

grant insert on table "public"."audience_views" to "authenticated";

grant references on table "public"."audience_views" to "authenticated";

grant select on table "public"."audience_views" to "authenticated";

grant trigger on table "public"."audience_views" to "authenticated";

grant truncate on table "public"."audience_views" to "authenticated";

grant update on table "public"."audience_views" to "authenticated";

grant delete on table "public"."audience_views" to "service_role";

grant insert on table "public"."audience_views" to "service_role";

grant references on table "public"."audience_views" to "service_role";

grant select on table "public"."audience_views" to "service_role";

grant trigger on table "public"."audience_views" to "service_role";

grant truncate on table "public"."audience_views" to "service_role";

grant update on table "public"."audience_views" to "service_role";

grant delete on table "public"."issue_index" to "anon";

grant insert on table "public"."issue_index" to "anon";

grant references on table "public"."issue_index" to "anon";

grant select on table "public"."issue_index" to "anon";

grant trigger on table "public"."issue_index" to "anon";

grant truncate on table "public"."issue_index" to "anon";

grant update on table "public"."issue_index" to "anon";

grant delete on table "public"."issue_index" to "authenticated";

grant insert on table "public"."issue_index" to "authenticated";

grant references on table "public"."issue_index" to "authenticated";

grant select on table "public"."issue_index" to "authenticated";

grant trigger on table "public"."issue_index" to "authenticated";

grant truncate on table "public"."issue_index" to "authenticated";

grant update on table "public"."issue_index" to "authenticated";

grant delete on table "public"."issue_index" to "service_role";

grant insert on table "public"."issue_index" to "service_role";

grant references on table "public"."issue_index" to "service_role";

grant select on table "public"."issue_index" to "service_role";

grant trigger on table "public"."issue_index" to "service_role";

grant truncate on table "public"."issue_index" to "service_role";

grant update on table "public"."issue_index" to "service_role";

grant delete on table "public"."knowledge_pushes" to "anon";

grant insert on table "public"."knowledge_pushes" to "anon";

grant references on table "public"."knowledge_pushes" to "anon";

grant select on table "public"."knowledge_pushes" to "anon";

grant trigger on table "public"."knowledge_pushes" to "anon";

grant truncate on table "public"."knowledge_pushes" to "anon";

grant update on table "public"."knowledge_pushes" to "anon";

grant delete on table "public"."knowledge_pushes" to "authenticated";

grant insert on table "public"."knowledge_pushes" to "authenticated";

grant references on table "public"."knowledge_pushes" to "authenticated";

grant select on table "public"."knowledge_pushes" to "authenticated";

grant trigger on table "public"."knowledge_pushes" to "authenticated";

grant truncate on table "public"."knowledge_pushes" to "authenticated";

grant update on table "public"."knowledge_pushes" to "authenticated";

grant delete on table "public"."knowledge_pushes" to "service_role";

grant insert on table "public"."knowledge_pushes" to "service_role";

grant references on table "public"."knowledge_pushes" to "service_role";

grant select on table "public"."knowledge_pushes" to "service_role";

grant trigger on table "public"."knowledge_pushes" to "service_role";

grant truncate on table "public"."knowledge_pushes" to "service_role";

grant update on table "public"."knowledge_pushes" to "service_role";

grant delete on table "public"."report_schedule_runs" to "anon";

grant insert on table "public"."report_schedule_runs" to "anon";

grant references on table "public"."report_schedule_runs" to "anon";

grant select on table "public"."report_schedule_runs" to "anon";

grant trigger on table "public"."report_schedule_runs" to "anon";

grant truncate on table "public"."report_schedule_runs" to "anon";

grant update on table "public"."report_schedule_runs" to "anon";

grant delete on table "public"."report_schedule_runs" to "authenticated";

grant insert on table "public"."report_schedule_runs" to "authenticated";

grant references on table "public"."report_schedule_runs" to "authenticated";

grant select on table "public"."report_schedule_runs" to "authenticated";

grant trigger on table "public"."report_schedule_runs" to "authenticated";

grant truncate on table "public"."report_schedule_runs" to "authenticated";

grant update on table "public"."report_schedule_runs" to "authenticated";

grant delete on table "public"."report_schedule_runs" to "service_role";

grant insert on table "public"."report_schedule_runs" to "service_role";

grant references on table "public"."report_schedule_runs" to "service_role";

grant select on table "public"."report_schedule_runs" to "service_role";

grant trigger on table "public"."report_schedule_runs" to "service_role";

grant truncate on table "public"."report_schedule_runs" to "service_role";

grant update on table "public"."report_schedule_runs" to "service_role";

grant delete on table "public"."report_schedules" to "anon";

grant insert on table "public"."report_schedules" to "anon";

grant references on table "public"."report_schedules" to "anon";

grant select on table "public"."report_schedules" to "anon";

grant trigger on table "public"."report_schedules" to "anon";

grant truncate on table "public"."report_schedules" to "anon";

grant update on table "public"."report_schedules" to "anon";

grant delete on table "public"."report_schedules" to "authenticated";

grant insert on table "public"."report_schedules" to "authenticated";

grant references on table "public"."report_schedules" to "authenticated";

grant select on table "public"."report_schedules" to "authenticated";

grant trigger on table "public"."report_schedules" to "authenticated";

grant truncate on table "public"."report_schedules" to "authenticated";

grant update on table "public"."report_schedules" to "authenticated";

grant delete on table "public"."report_schedules" to "service_role";

grant insert on table "public"."report_schedules" to "service_role";

grant references on table "public"."report_schedules" to "service_role";

grant select on table "public"."report_schedules" to "service_role";

grant trigger on table "public"."report_schedules" to "service_role";

grant truncate on table "public"."report_schedules" to "service_role";

grant update on table "public"."report_schedules" to "service_role";

grant delete on table "public"."workspace_sources" to "anon";

grant insert on table "public"."workspace_sources" to "anon";

grant references on table "public"."workspace_sources" to "anon";

grant select on table "public"."workspace_sources" to "anon";

grant trigger on table "public"."workspace_sources" to "anon";

grant truncate on table "public"."workspace_sources" to "anon";

grant update on table "public"."workspace_sources" to "anon";

grant delete on table "public"."workspace_sources" to "authenticated";

grant insert on table "public"."workspace_sources" to "authenticated";

grant references on table "public"."workspace_sources" to "authenticated";

grant select on table "public"."workspace_sources" to "authenticated";

grant trigger on table "public"."workspace_sources" to "authenticated";

grant truncate on table "public"."workspace_sources" to "authenticated";

grant update on table "public"."workspace_sources" to "authenticated";

grant delete on table "public"."workspace_sources" to "service_role";

grant insert on table "public"."workspace_sources" to "service_role";

grant references on table "public"."workspace_sources" to "service_role";

grant select on table "public"."workspace_sources" to "service_role";

grant trigger on table "public"."workspace_sources" to "service_role";

grant truncate on table "public"."workspace_sources" to "service_role";

grant update on table "public"."workspace_sources" to "service_role";


  create policy "akus_owner"
  on "public"."akus"
  as permissive
  for all
  to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "audience_views_owner"
  on "public"."audience_views"
  as permissive
  for all
  to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "issue_index_delete_own_sources"
  on "public"."issue_index"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.workspace_sources ws
  WHERE ((ws.id = issue_index.source_id) AND (ws.user_id = auth.uid())))));



  create policy "issue_index_insert_own_sources"
  on "public"."issue_index"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.workspace_sources ws
  WHERE ((ws.id = issue_index.source_id) AND (ws.user_id = auth.uid())))));



  create policy "issue_index_select_own_sources"
  on "public"."issue_index"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.workspace_sources ws
  WHERE ((ws.id = issue_index.source_id) AND (ws.user_id = auth.uid())))));



  create policy "issue_index_update_own_sources"
  on "public"."issue_index"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.workspace_sources ws
  WHERE ((ws.id = issue_index.source_id) AND (ws.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM public.workspace_sources ws
  WHERE ((ws.id = issue_index.source_id) AND (ws.user_id = auth.uid())))));



  create policy "knowledge_pushes_delete_own"
  on "public"."knowledge_pushes"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "knowledge_pushes_insert_own"
  on "public"."knowledge_pushes"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "knowledge_pushes_select_own"
  on "public"."knowledge_pushes"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "knowledge_pushes_update_own"
  on "public"."knowledge_pushes"
  as permissive
  for update
  to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "Users can delete their own file summaries"
  on "public"."repo_file_summaries"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.workspace_sources ws
  WHERE ((ws.id = repo_file_summaries.source_id) AND (ws.user_id = auth.uid())))));



  create policy "Users can insert their own file summaries"
  on "public"."repo_file_summaries"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.workspace_sources ws
  WHERE ((ws.id = repo_file_summaries.source_id) AND (ws.user_id = auth.uid())))));



  create policy "Users can update their own file summaries"
  on "public"."repo_file_summaries"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.workspace_sources ws
  WHERE ((ws.id = repo_file_summaries.source_id) AND (ws.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM public.workspace_sources ws
  WHERE ((ws.id = repo_file_summaries.source_id) AND (ws.user_id = auth.uid())))));



  create policy "Users can view their own file summaries"
  on "public"."repo_file_summaries"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.workspace_sources ws
  WHERE ((ws.id = repo_file_summaries.source_id) AND (ws.user_id = auth.uid())))));



  create policy "Service role can manage report schedule runs"
  on "public"."report_schedule_runs"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));



  create policy "Users can insert their own report schedule runs"
  on "public"."report_schedule_runs"
  as permissive
  for insert
  to public
with check ((user_id = auth.uid()));



  create policy "Users can view their own report schedule runs"
  on "public"."report_schedule_runs"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "Users can delete their own report schedules"
  on "public"."report_schedules"
  as permissive
  for delete
  to public
using ((user_id = auth.uid()));



  create policy "Users can insert their own report schedules"
  on "public"."report_schedules"
  as permissive
  for insert
  to public
with check ((user_id = auth.uid()));



  create policy "Users can update their own report schedules"
  on "public"."report_schedules"
  as permissive
  for update
  to public
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



  create policy "Users can view their own report schedules"
  on "public"."report_schedules"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "User can access everything"
  on "public"."workspace_sources"
  as permissive
  for all
  to public
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



  create policy "Users can delete their own workspace repos"
  on "public"."workspace_sources"
  as permissive
  for delete
  to public
using ((user_id = auth.uid()));



  create policy "Users can insert their own workspace repos"
  on "public"."workspace_sources"
  as permissive
  for insert
  to public
with check ((user_id = auth.uid()));



  create policy "Users can update their own workspace repos"
  on "public"."workspace_sources"
  as permissive
  for update
  to public
using ((user_id = auth.uid()));



  create policy "Users can view their own workspace repos"
  on "public"."workspace_sources"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "Users can create diagrams for their repos"
  on "public"."diagrams"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.workspace_sources
  WHERE ((workspace_sources.id = diagrams.source_id) AND (workspace_sources.user_id = auth.uid())))));



  create policy "Users can delete their own diagrams"
  on "public"."diagrams"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.workspace_sources
  WHERE ((workspace_sources.id = diagrams.source_id) AND (workspace_sources.user_id = auth.uid())))));



  create policy "Users can update their own diagrams"
  on "public"."diagrams"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.workspace_sources
  WHERE ((workspace_sources.id = diagrams.source_id) AND (workspace_sources.user_id = auth.uid())))));



  create policy "Users can view their own diagrams"
  on "public"."diagrams"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.workspace_sources
  WHERE ((workspace_sources.id = diagrams.source_id) AND (workspace_sources.user_id = auth.uid())))));


CREATE TRIGGER trg_delete_akus_for_source AFTER DELETE ON public.workspace_sources FOR EACH ROW EXECUTE FUNCTION public.delete_akus_for_source();


