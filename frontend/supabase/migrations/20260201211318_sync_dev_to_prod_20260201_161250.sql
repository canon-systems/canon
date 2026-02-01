drop trigger if exists "trg_delete_akus_for_source" on "public"."workspace_sources";

drop policy "akus_owner" on "public"."akus";

drop policy "audience_views_owner" on "public"."audience_views";

drop policy "issue_index_delete_own_sources" on "public"."issue_index";

drop policy "issue_index_insert_own_sources" on "public"."issue_index";

drop policy "issue_index_select_own_sources" on "public"."issue_index";

drop policy "issue_index_update_own_sources" on "public"."issue_index";

drop policy "knowledge_pushes_delete_own" on "public"."knowledge_pushes";

drop policy "knowledge_pushes_insert_own" on "public"."knowledge_pushes";

drop policy "knowledge_pushes_select_own" on "public"."knowledge_pushes";

drop policy "knowledge_pushes_update_own" on "public"."knowledge_pushes";

drop policy "Users can delete their own file summaries" on "public"."repo_file_summaries";

drop policy "Users can insert their own file summaries" on "public"."repo_file_summaries";

drop policy "Users can update their own file summaries" on "public"."repo_file_summaries";

drop policy "Users can view their own file summaries" on "public"."repo_file_summaries";

drop policy "Service role can manage report schedule runs" on "public"."report_schedule_runs";

drop policy "Users can insert their own report schedule runs" on "public"."report_schedule_runs";

drop policy "Users can view their own report schedule runs" on "public"."report_schedule_runs";

drop policy "Users can delete their own report schedules" on "public"."report_schedules";

drop policy "Users can insert their own report schedules" on "public"."report_schedules";

drop policy "Users can update their own report schedules" on "public"."report_schedules";

drop policy "Users can view their own report schedules" on "public"."report_schedules";

drop policy "User can access everything" on "public"."workspace_sources";

drop policy "Users can delete their own workspace repos" on "public"."workspace_sources";

drop policy "Users can insert their own workspace repos" on "public"."workspace_sources";

drop policy "Users can update their own workspace repos" on "public"."workspace_sources";

drop policy "Users can view their own workspace repos" on "public"."workspace_sources";

drop policy "Users can create diagrams for their repos" on "public"."diagrams";

drop policy "Users can delete their own diagrams" on "public"."diagrams";

drop policy "Users can update their own diagrams" on "public"."diagrams";

drop policy "Users can view their own diagrams" on "public"."diagrams";

revoke delete on table "public"."akus" from "anon";

revoke insert on table "public"."akus" from "anon";

revoke references on table "public"."akus" from "anon";

revoke select on table "public"."akus" from "anon";

revoke trigger on table "public"."akus" from "anon";

revoke truncate on table "public"."akus" from "anon";

revoke update on table "public"."akus" from "anon";

revoke delete on table "public"."akus" from "authenticated";

revoke insert on table "public"."akus" from "authenticated";

revoke references on table "public"."akus" from "authenticated";

revoke select on table "public"."akus" from "authenticated";

revoke trigger on table "public"."akus" from "authenticated";

revoke truncate on table "public"."akus" from "authenticated";

revoke update on table "public"."akus" from "authenticated";

revoke delete on table "public"."akus" from "service_role";

revoke insert on table "public"."akus" from "service_role";

revoke references on table "public"."akus" from "service_role";

revoke select on table "public"."akus" from "service_role";

revoke trigger on table "public"."akus" from "service_role";

revoke truncate on table "public"."akus" from "service_role";

revoke update on table "public"."akus" from "service_role";

revoke delete on table "public"."audience_views" from "anon";

revoke insert on table "public"."audience_views" from "anon";

revoke references on table "public"."audience_views" from "anon";

revoke select on table "public"."audience_views" from "anon";

revoke trigger on table "public"."audience_views" from "anon";

revoke truncate on table "public"."audience_views" from "anon";

revoke update on table "public"."audience_views" from "anon";

revoke delete on table "public"."audience_views" from "authenticated";

revoke insert on table "public"."audience_views" from "authenticated";

revoke references on table "public"."audience_views" from "authenticated";

revoke select on table "public"."audience_views" from "authenticated";

revoke trigger on table "public"."audience_views" from "authenticated";

revoke truncate on table "public"."audience_views" from "authenticated";

revoke update on table "public"."audience_views" from "authenticated";

revoke delete on table "public"."audience_views" from "service_role";

revoke insert on table "public"."audience_views" from "service_role";

revoke references on table "public"."audience_views" from "service_role";

revoke select on table "public"."audience_views" from "service_role";

revoke trigger on table "public"."audience_views" from "service_role";

revoke truncate on table "public"."audience_views" from "service_role";

revoke update on table "public"."audience_views" from "service_role";

revoke delete on table "public"."issue_index" from "anon";

revoke insert on table "public"."issue_index" from "anon";

revoke references on table "public"."issue_index" from "anon";

revoke select on table "public"."issue_index" from "anon";

revoke trigger on table "public"."issue_index" from "anon";

revoke truncate on table "public"."issue_index" from "anon";

revoke update on table "public"."issue_index" from "anon";

revoke delete on table "public"."issue_index" from "authenticated";

revoke insert on table "public"."issue_index" from "authenticated";

revoke references on table "public"."issue_index" from "authenticated";

revoke select on table "public"."issue_index" from "authenticated";

revoke trigger on table "public"."issue_index" from "authenticated";

revoke truncate on table "public"."issue_index" from "authenticated";

revoke update on table "public"."issue_index" from "authenticated";

revoke delete on table "public"."issue_index" from "service_role";

revoke insert on table "public"."issue_index" from "service_role";

revoke references on table "public"."issue_index" from "service_role";

revoke select on table "public"."issue_index" from "service_role";

revoke trigger on table "public"."issue_index" from "service_role";

revoke truncate on table "public"."issue_index" from "service_role";

revoke update on table "public"."issue_index" from "service_role";

revoke delete on table "public"."knowledge_pushes" from "anon";

revoke insert on table "public"."knowledge_pushes" from "anon";

revoke references on table "public"."knowledge_pushes" from "anon";

revoke select on table "public"."knowledge_pushes" from "anon";

revoke trigger on table "public"."knowledge_pushes" from "anon";

revoke truncate on table "public"."knowledge_pushes" from "anon";

revoke update on table "public"."knowledge_pushes" from "anon";

revoke delete on table "public"."knowledge_pushes" from "authenticated";

revoke insert on table "public"."knowledge_pushes" from "authenticated";

revoke references on table "public"."knowledge_pushes" from "authenticated";

revoke select on table "public"."knowledge_pushes" from "authenticated";

revoke trigger on table "public"."knowledge_pushes" from "authenticated";

revoke truncate on table "public"."knowledge_pushes" from "authenticated";

revoke update on table "public"."knowledge_pushes" from "authenticated";

revoke delete on table "public"."knowledge_pushes" from "service_role";

revoke insert on table "public"."knowledge_pushes" from "service_role";

revoke references on table "public"."knowledge_pushes" from "service_role";

revoke select on table "public"."knowledge_pushes" from "service_role";

revoke trigger on table "public"."knowledge_pushes" from "service_role";

revoke truncate on table "public"."knowledge_pushes" from "service_role";

revoke update on table "public"."knowledge_pushes" from "service_role";

revoke delete on table "public"."report_schedule_runs" from "anon";

revoke insert on table "public"."report_schedule_runs" from "anon";

revoke references on table "public"."report_schedule_runs" from "anon";

revoke select on table "public"."report_schedule_runs" from "anon";

revoke trigger on table "public"."report_schedule_runs" from "anon";

revoke truncate on table "public"."report_schedule_runs" from "anon";

revoke update on table "public"."report_schedule_runs" from "anon";

revoke delete on table "public"."report_schedule_runs" from "authenticated";

revoke insert on table "public"."report_schedule_runs" from "authenticated";

revoke references on table "public"."report_schedule_runs" from "authenticated";

revoke select on table "public"."report_schedule_runs" from "authenticated";

revoke trigger on table "public"."report_schedule_runs" from "authenticated";

revoke truncate on table "public"."report_schedule_runs" from "authenticated";

revoke update on table "public"."report_schedule_runs" from "authenticated";

revoke delete on table "public"."report_schedule_runs" from "service_role";

revoke insert on table "public"."report_schedule_runs" from "service_role";

revoke references on table "public"."report_schedule_runs" from "service_role";

revoke select on table "public"."report_schedule_runs" from "service_role";

revoke trigger on table "public"."report_schedule_runs" from "service_role";

revoke truncate on table "public"."report_schedule_runs" from "service_role";

revoke update on table "public"."report_schedule_runs" from "service_role";

revoke delete on table "public"."report_schedules" from "anon";

revoke insert on table "public"."report_schedules" from "anon";

revoke references on table "public"."report_schedules" from "anon";

revoke select on table "public"."report_schedules" from "anon";

revoke trigger on table "public"."report_schedules" from "anon";

revoke truncate on table "public"."report_schedules" from "anon";

revoke update on table "public"."report_schedules" from "anon";

revoke delete on table "public"."report_schedules" from "authenticated";

revoke insert on table "public"."report_schedules" from "authenticated";

revoke references on table "public"."report_schedules" from "authenticated";

revoke select on table "public"."report_schedules" from "authenticated";

revoke trigger on table "public"."report_schedules" from "authenticated";

revoke truncate on table "public"."report_schedules" from "authenticated";

revoke update on table "public"."report_schedules" from "authenticated";

revoke delete on table "public"."report_schedules" from "service_role";

revoke insert on table "public"."report_schedules" from "service_role";

revoke references on table "public"."report_schedules" from "service_role";

revoke select on table "public"."report_schedules" from "service_role";

revoke trigger on table "public"."report_schedules" from "service_role";

revoke truncate on table "public"."report_schedules" from "service_role";

revoke update on table "public"."report_schedules" from "service_role";

revoke delete on table "public"."workspace_sources" from "anon";

revoke insert on table "public"."workspace_sources" from "anon";

revoke references on table "public"."workspace_sources" from "anon";

revoke select on table "public"."workspace_sources" from "anon";

revoke trigger on table "public"."workspace_sources" from "anon";

revoke truncate on table "public"."workspace_sources" from "anon";

revoke update on table "public"."workspace_sources" from "anon";

revoke delete on table "public"."workspace_sources" from "authenticated";

revoke insert on table "public"."workspace_sources" from "authenticated";

revoke references on table "public"."workspace_sources" from "authenticated";

revoke select on table "public"."workspace_sources" from "authenticated";

revoke trigger on table "public"."workspace_sources" from "authenticated";

revoke truncate on table "public"."workspace_sources" from "authenticated";

revoke update on table "public"."workspace_sources" from "authenticated";

revoke delete on table "public"."workspace_sources" from "service_role";

revoke insert on table "public"."workspace_sources" from "service_role";

revoke references on table "public"."workspace_sources" from "service_role";

revoke select on table "public"."workspace_sources" from "service_role";

revoke trigger on table "public"."workspace_sources" from "service_role";

revoke truncate on table "public"."workspace_sources" from "service_role";

revoke update on table "public"."workspace_sources" from "service_role";

alter table "public"."akus" drop constraint "akus_hash_key";

alter table "public"."akus" drop constraint "akus_user_id_fkey";

alter table "public"."audience_views" drop constraint "audience_views_aku_audience_key";

alter table "public"."audience_views" drop constraint "audience_views_aku_id_fkey";

alter table "public"."audience_views" drop constraint "audience_views_user_id_fkey";

alter table "public"."diagrams" drop constraint "diagrams_source_id_fkey";

alter table "public"."issue_index" drop constraint "issue_index_source_id_fkey";

alter table "public"."knowledge_pushes" drop constraint "knowledge_pushes_aku_fk";

alter table "public"."knowledge_pushes" drop constraint "knowledge_pushes_entity_type_check";

alter table "public"."repo_file_summaries" drop constraint "repo_file_summaries_source_id_file_path_branch_key";

alter table "public"."repo_file_summaries" drop constraint "repo_file_summaries_source_id_fkey";

alter table "public"."report_schedule_runs" drop constraint "report_schedule_runs_report_schedule_id_fkey";

alter table "public"."report_schedule_runs" drop constraint "report_schedule_runs_status_check";

alter table "public"."report_schedule_runs" drop constraint "report_schedule_runs_trigger_type_check";

alter table "public"."report_schedule_runs" drop constraint "report_schedule_runs_user_id_fkey";

alter table "public"."report_schedules" drop constraint "report_schedules_user_id_fkey";

alter table "public"."workspace_sources" drop constraint "fk_workspace";

alter table "public"."workspace_sources" drop constraint "workspace_sources_connection_id_fkey";

drop function if exists "public"."_matches_repo_id"(ws jsonb, r text);

drop function if exists "public"."delete_akus_for_source"();

alter table "public"."akus" drop constraint "akus_pkey";

alter table "public"."audience_views" drop constraint "audience_views_pkey";

alter table "public"."issue_index" drop constraint "issue_index_pkey";

alter table "public"."knowledge_pushes" drop constraint "knowledge_pushes_pkey";

alter table "public"."report_schedule_runs" drop constraint "report_schedule_runs_pkey";

alter table "public"."report_schedules" drop constraint "report_schedules_pkey";

alter table "public"."workspace_sources" drop constraint "workspace_repos_pkey";

drop index if exists "public"."akus_hash_key";

drop index if exists "public"."akus_pkey";

drop index if exists "public"."audience_views_aku_audience_key";

drop index if exists "public"."audience_views_pkey";

drop index if exists "public"."idx_repo_file_summaries_source_id";

drop index if exists "public"."idx_report_schedule_runs_executed_at";

drop index if exists "public"."idx_report_schedule_runs_schedule_executed";

drop index if exists "public"."idx_report_schedule_runs_user_executed";

drop index if exists "public"."idx_report_schedules_user_enabled";

drop index if exists "public"."idx_report_schedules_user_id";

drop index if exists "public"."idx_report_schedules_user_type";

drop index if exists "public"."idx_workspace_sources_connection_id";

drop index if exists "public"."idx_workspace_sources_provider";

drop index if exists "public"."idx_workspace_sources_scope_gin";

drop index if exists "public"."issue_index_labels_gin";

drop index if exists "public"."issue_index_pkey";

drop index if exists "public"."issue_index_source_key_unique";

drop index if exists "public"."issue_index_source_provider_status";

drop index if exists "public"."issue_index_source_updated_desc";

drop index if exists "public"."knowledge_pushes_pkey";

drop index if exists "public"."knowledge_pushes_uniq";

drop index if exists "public"."repo_file_summaries_source_id_file_path_branch_key";

drop index if exists "public"."report_schedule_runs_pkey";

drop index if exists "public"."report_schedules_pkey";

drop index if exists "public"."idx_diagrams_repo_id";

drop index if exists "public"."idx_workspace_repos_user_id";

drop index if exists "public"."workspace_repos_pkey";

drop table "public"."akus";

drop table "public"."audience_views";

drop table "public"."issue_index";

drop table "public"."knowledge_pushes";

drop table "public"."report_schedule_runs";

drop table "public"."report_schedules";

drop table "public"."workspace_sources";


  create table "public"."automation_rules" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "repo_id" uuid not null,
    "name" text,
    "enabled" boolean default true,
    "schedule" text,
    "target_diagrams" text[] default '{}'::text[],
    "last_run_at" timestamp with time zone,
    "last_run_status" text,
    "last_run_error" text,
    "generate_doc" boolean default false,
    "generate_diagram" boolean default false,
    "auto_publish" boolean default false,
    "auto_publish_target" jsonb,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "auto_approve" boolean default false
      );


alter table "public"."automation_rules" enable row level security;


  create table "public"."automation_runs" (
    "id" uuid not null default gen_random_uuid(),
    "repo_id" uuid not null,
    "user_id" uuid not null,
    "executed_at" timestamp with time zone not null default now(),
    "trigger_type" text default 'scheduled'::text,
    "skip_reason" text,
    "actions" text[] default '{}'::text[],
    "execution_time_ms" integer,
    "files_processed" integer default 0,
    "documents_updated" integer default 0,
    "errors" jsonb default '[]'::jsonb,
    "created_at" timestamp with time zone not null default now(),
    "generated_documents" jsonb default '[]'::jsonb,
    "generated_diagrams" jsonb default '[]'::jsonb,
    "status" text not null,
    "automation_rule_id" uuid
      );


alter table "public"."automation_runs" enable row level security;


  create table "public"."document_files" (
    "document_id" uuid not null,
    "file_path" text not null,
    "source_id" text not null
      );


alter table "public"."document_files" enable row level security;


  create table "public"."document_versions" (
    "id" uuid not null default gen_random_uuid(),
    "document_id" uuid,
    "version_number" integer not null,
    "content" text not null,
    "change_summary" text,
    "created_at" timestamp with time zone default now(),
    "status" text not null default 'approved'::text,
    "metadata" jsonb not null default '{}'::jsonb
      );


alter table "public"."document_versions" enable row level security;


  create table "public"."documents" (
    "id" uuid not null default gen_random_uuid(),
    "title" text not null,
    "content" text not null,
    "kb_id" text,
    "kb_provider" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "configuration" jsonb not null default '{}'::jsonb,
    "source_repo_ids" uuid[] not null default '{}'::uuid[],
    "source_id" text not null
      );


alter table "public"."documents" enable row level security;


  create table "public"."repository_setup" (
    "id" uuid not null default gen_random_uuid(),
    "repo_id" uuid not null,
    "setup_status" text not null default 'not_started'::text,
    "total_files" integer default 0,
    "summarized_files" integer default 0,
    "setup_started_at" timestamp with time zone default now(),
    "setup_completed_at" timestamp with time zone,
    "last_analyzed" timestamp with time zone,
    "error_message" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "branch" text not null,
    "current_file" text,
    "processing_status" text,
    "progress_percentage" numeric,
    "processing_rate" numeric,
    "estimated_time_remaining" numeric,
    "recent_files" text,
    "last_progress_update" timestamp with time zone
      );


alter table "public"."repository_setup" enable row level security;


  create table "public"."workspace_repos" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "name" text not null,
    "provider" text not null default 'github'::text,
    "repo_url" text not null,
    "default_branch" text not null default 'main'::text,
    "auth_type" text not null default 'github_pat'::text,
    "credentials_ref" text,
    "settings" jsonb default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."workspace_repos" enable row level security;

alter table "public"."diagrams" drop column "source_id";

alter table "public"."diagrams" add column "repo_id" uuid not null;

alter table "public"."repo_file_summaries" drop column "source_id";

alter table "public"."repo_file_summaries" add column "repo_id" text not null;

alter table "public"."repo_file_summaries" alter column "source_key" drop not null;

drop type "public"."report_schedule_type";

CREATE UNIQUE INDEX automation_rules_pkey ON public.automation_rules USING btree (id);

CREATE UNIQUE INDEX automation_rules_user_id_repo_id_key ON public.automation_rules USING btree (user_id, repo_id);

CREATE UNIQUE INDEX automation_runs_pkey ON public.automation_runs USING btree (id);

CREATE UNIQUE INDEX document_versions_document_id_version_number_key ON public.document_versions USING btree (document_id, version_number);

CREATE UNIQUE INDEX document_versions_pkey ON public.document_versions USING btree (id);

CREATE UNIQUE INDEX documents_pkey ON public.documents USING btree (id);

CREATE INDEX idx_automation_rules_workspace_enabled ON public.automation_rules USING btree (user_id, enabled);

CREATE INDEX idx_automation_rules_workspace_repo ON public.automation_rules USING btree (user_id, repo_id);

CREATE INDEX idx_automation_runs_automation_rule_id_executed_at ON public.automation_runs USING btree (automation_rule_id, executed_at DESC);

CREATE INDEX idx_automation_runs_executed_at ON public.automation_runs USING btree (executed_at DESC);

CREATE INDEX idx_automation_runs_repo_id_executed_at ON public.automation_runs USING btree (repo_id, executed_at DESC);

CREATE INDEX idx_automation_runs_trigger_type ON public.automation_runs USING btree (trigger_type);

CREATE INDEX idx_automation_runs_workspace_id_executed_at ON public.automation_runs USING btree (user_id, executed_at DESC);

CREATE INDEX idx_document_files_composite ON public.document_files USING btree (document_id, file_path);

CREATE INDEX idx_document_files_document_id ON public.document_files USING btree (document_id);

CREATE INDEX idx_document_files_file_path ON public.document_files USING btree (file_path);

CREATE INDEX idx_document_versions_created_at ON public.document_versions USING btree (created_at DESC);

CREATE INDEX idx_document_versions_document_id ON public.document_versions USING btree (document_id);

CREATE INDEX idx_document_versions_document_status ON public.document_versions USING btree (document_id, status);

CREATE INDEX idx_document_versions_document_version ON public.document_versions USING btree (document_id, version_number DESC);

CREATE INDEX idx_document_versions_version ON public.document_versions USING btree (document_id, version_number DESC);

CREATE INDEX idx_documents_created_at ON public.documents USING btree (created_at DESC);

CREATE INDEX idx_documents_kb_id ON public.documents USING btree (kb_id);

CREATE INDEX idx_documents_updated_at ON public.documents USING btree (updated_at DESC);

CREATE INDEX idx_repo_file_summaries_branch ON public.repo_file_summaries USING btree (repo_id, branch);

CREATE INDEX idx_repo_file_summaries_composite ON public.repo_file_summaries USING btree (repo_id, file_path, branch);

CREATE INDEX idx_repo_file_summaries_repo_hash ON public.repo_file_summaries USING btree (repo_id, file_hash);

CREATE INDEX idx_repo_file_summaries_repo_id ON public.repo_file_summaries USING btree (repo_id);

CREATE INDEX idx_repository_setup_repo_id ON public.repository_setup USING btree (repo_id);

CREATE INDEX idx_repository_setup_status ON public.repository_setup USING btree (setup_status);

CREATE INDEX idx_workspace_repos_repo_url ON public.workspace_repos USING btree (repo_url);

CREATE UNIQUE INDEX repo_file_summaries_repo_id_file_path_branch_key ON public.repo_file_summaries USING btree (repo_id, file_path, branch);

CREATE UNIQUE INDEX repository_setup_pkey ON public.repository_setup USING btree (id);

CREATE UNIQUE INDEX repository_setup_repo_id_key ON public.repository_setup USING btree (repo_id);

CREATE INDEX idx_diagrams_repo_id ON public.diagrams USING btree (repo_id);

CREATE INDEX idx_workspace_repos_user_id ON public.workspace_repos USING btree (user_id);

CREATE UNIQUE INDEX workspace_repos_pkey ON public.workspace_repos USING btree (id);

alter table "public"."automation_rules" add constraint "automation_rules_pkey" PRIMARY KEY using index "automation_rules_pkey";

alter table "public"."automation_runs" add constraint "automation_runs_pkey" PRIMARY KEY using index "automation_runs_pkey";

alter table "public"."document_versions" add constraint "document_versions_pkey" PRIMARY KEY using index "document_versions_pkey";

alter table "public"."documents" add constraint "documents_pkey" PRIMARY KEY using index "documents_pkey";

alter table "public"."repository_setup" add constraint "repository_setup_pkey" PRIMARY KEY using index "repository_setup_pkey";

alter table "public"."workspace_repos" add constraint "workspace_repos_pkey" PRIMARY KEY using index "workspace_repos_pkey";

alter table "public"."automation_rules" add constraint "automation_rules_repo_id_fkey" FOREIGN KEY (repo_id) REFERENCES public.workspace_repos(id) ON DELETE CASCADE not valid;

alter table "public"."automation_rules" validate constraint "automation_rules_repo_id_fkey";

alter table "public"."automation_rules" add constraint "automation_rules_user_id_repo_id_key" UNIQUE using index "automation_rules_user_id_repo_id_key";

alter table "public"."automation_rules" add constraint "automation_rules_workspace_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."automation_rules" validate constraint "automation_rules_workspace_id_fkey";

alter table "public"."automation_runs" add constraint "automation_runs_automation_rule_id_fkey" FOREIGN KEY (automation_rule_id) REFERENCES public.automation_rules(id) ON DELETE SET NULL not valid;

alter table "public"."automation_runs" validate constraint "automation_runs_automation_rule_id_fkey";

alter table "public"."automation_runs" add constraint "automation_runs_repo_id_fkey" FOREIGN KEY (repo_id) REFERENCES public.workspace_repos(id) ON DELETE CASCADE not valid;

alter table "public"."automation_runs" validate constraint "automation_runs_repo_id_fkey";

alter table "public"."automation_runs" add constraint "automation_runs_status_check" CHECK ((status = ANY (ARRAY['succeeded'::text, 'failed'::text, 'skipped'::text]))) not valid;

alter table "public"."automation_runs" validate constraint "automation_runs_status_check";

alter table "public"."automation_runs" add constraint "automation_runs_trigger_type_check" CHECK ((trigger_type = ANY (ARRAY['manual'::text, 'scheduled'::text]))) not valid;

alter table "public"."automation_runs" validate constraint "automation_runs_trigger_type_check";

alter table "public"."automation_runs" add constraint "automation_runs_workspace_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."automation_runs" validate constraint "automation_runs_workspace_id_fkey";

alter table "public"."diagrams" add constraint "diagrams_repo_id_fkey" FOREIGN KEY (repo_id) REFERENCES public.workspace_repos(id) ON DELETE CASCADE not valid;

alter table "public"."diagrams" validate constraint "diagrams_repo_id_fkey";

alter table "public"."document_files" add constraint "document_files_document_id_fkey" FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE not valid;

alter table "public"."document_files" validate constraint "document_files_document_id_fkey";

alter table "public"."document_versions" add constraint "document_versions_document_id_fkey" FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE not valid;

alter table "public"."document_versions" validate constraint "document_versions_document_id_fkey";

alter table "public"."document_versions" add constraint "document_versions_document_id_version_number_key" UNIQUE using index "document_versions_document_id_version_number_key";

alter table "public"."repo_file_summaries" add constraint "repo_file_summaries_repo_id_file_path_branch_key" UNIQUE using index "repo_file_summaries_repo_id_file_path_branch_key";

alter table "public"."repository_setup" add constraint "repository_setup_repo_id_key" UNIQUE using index "repository_setup_repo_id_key";

alter table "public"."repository_setup" add constraint "repository_setup_repo_id_workspace_repos_fkey" FOREIGN KEY (repo_id) REFERENCES public.workspace_repos(id) ON DELETE CASCADE not valid;

alter table "public"."repository_setup" validate constraint "repository_setup_repo_id_workspace_repos_fkey";

alter table "public"."repository_setup" add constraint "repository_setup_setup_status_check" CHECK ((setup_status = ANY (ARRAY['not_started'::text, 'analyzing'::text, 'summaries_generated'::text, 'ready'::text, 'failed'::text]))) not valid;

alter table "public"."repository_setup" validate constraint "repository_setup_setup_status_check";

alter table "public"."workspace_repos" add constraint "fk_workspace" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."workspace_repos" validate constraint "fk_workspace";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.cleanup_old_automation_runs(days_to_keep integer DEFAULT 90)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.create_document_version(p_document_id uuid, p_content text, p_change_summary text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_next_document_version(doc_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    next_version integer;
BEGIN
    SELECT COALESCE(MAX(version_number), 0) + 1
    INTO next_version
    FROM public.document_versions
    WHERE document_id = doc_id;
    
    RETURN next_version;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_repository_setup_with_relationships(repo_id_param uuid)
 RETURNS TABLE(setup_status text, total_files integer, summarized_files integer, setup_progress numeric, file_relationships json, recent_docs json)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

grant delete on table "public"."automation_rules" to "anon";

grant insert on table "public"."automation_rules" to "anon";

grant references on table "public"."automation_rules" to "anon";

grant select on table "public"."automation_rules" to "anon";

grant trigger on table "public"."automation_rules" to "anon";

grant truncate on table "public"."automation_rules" to "anon";

grant update on table "public"."automation_rules" to "anon";

grant delete on table "public"."automation_rules" to "authenticated";

grant insert on table "public"."automation_rules" to "authenticated";

grant references on table "public"."automation_rules" to "authenticated";

grant select on table "public"."automation_rules" to "authenticated";

grant trigger on table "public"."automation_rules" to "authenticated";

grant truncate on table "public"."automation_rules" to "authenticated";

grant update on table "public"."automation_rules" to "authenticated";

grant delete on table "public"."automation_rules" to "service_role";

grant insert on table "public"."automation_rules" to "service_role";

grant references on table "public"."automation_rules" to "service_role";

grant select on table "public"."automation_rules" to "service_role";

grant trigger on table "public"."automation_rules" to "service_role";

grant truncate on table "public"."automation_rules" to "service_role";

grant update on table "public"."automation_rules" to "service_role";

grant delete on table "public"."automation_runs" to "anon";

grant insert on table "public"."automation_runs" to "anon";

grant references on table "public"."automation_runs" to "anon";

grant select on table "public"."automation_runs" to "anon";

grant trigger on table "public"."automation_runs" to "anon";

grant truncate on table "public"."automation_runs" to "anon";

grant update on table "public"."automation_runs" to "anon";

grant delete on table "public"."automation_runs" to "authenticated";

grant insert on table "public"."automation_runs" to "authenticated";

grant references on table "public"."automation_runs" to "authenticated";

grant select on table "public"."automation_runs" to "authenticated";

grant trigger on table "public"."automation_runs" to "authenticated";

grant truncate on table "public"."automation_runs" to "authenticated";

grant update on table "public"."automation_runs" to "authenticated";

grant delete on table "public"."automation_runs" to "service_role";

grant insert on table "public"."automation_runs" to "service_role";

grant references on table "public"."automation_runs" to "service_role";

grant select on table "public"."automation_runs" to "service_role";

grant trigger on table "public"."automation_runs" to "service_role";

grant truncate on table "public"."automation_runs" to "service_role";

grant update on table "public"."automation_runs" to "service_role";

grant delete on table "public"."document_files" to "anon";

grant insert on table "public"."document_files" to "anon";

grant references on table "public"."document_files" to "anon";

grant select on table "public"."document_files" to "anon";

grant trigger on table "public"."document_files" to "anon";

grant truncate on table "public"."document_files" to "anon";

grant update on table "public"."document_files" to "anon";

grant delete on table "public"."document_files" to "authenticated";

grant insert on table "public"."document_files" to "authenticated";

grant references on table "public"."document_files" to "authenticated";

grant select on table "public"."document_files" to "authenticated";

grant trigger on table "public"."document_files" to "authenticated";

grant truncate on table "public"."document_files" to "authenticated";

grant update on table "public"."document_files" to "authenticated";

grant delete on table "public"."document_files" to "service_role";

grant insert on table "public"."document_files" to "service_role";

grant references on table "public"."document_files" to "service_role";

grant select on table "public"."document_files" to "service_role";

grant trigger on table "public"."document_files" to "service_role";

grant truncate on table "public"."document_files" to "service_role";

grant update on table "public"."document_files" to "service_role";

grant delete on table "public"."document_versions" to "anon";

grant insert on table "public"."document_versions" to "anon";

grant references on table "public"."document_versions" to "anon";

grant select on table "public"."document_versions" to "anon";

grant trigger on table "public"."document_versions" to "anon";

grant truncate on table "public"."document_versions" to "anon";

grant update on table "public"."document_versions" to "anon";

grant delete on table "public"."document_versions" to "authenticated";

grant insert on table "public"."document_versions" to "authenticated";

grant references on table "public"."document_versions" to "authenticated";

grant select on table "public"."document_versions" to "authenticated";

grant trigger on table "public"."document_versions" to "authenticated";

grant truncate on table "public"."document_versions" to "authenticated";

grant update on table "public"."document_versions" to "authenticated";

grant delete on table "public"."document_versions" to "service_role";

grant insert on table "public"."document_versions" to "service_role";

grant references on table "public"."document_versions" to "service_role";

grant select on table "public"."document_versions" to "service_role";

grant trigger on table "public"."document_versions" to "service_role";

grant truncate on table "public"."document_versions" to "service_role";

grant update on table "public"."document_versions" to "service_role";

grant delete on table "public"."documents" to "anon";

grant insert on table "public"."documents" to "anon";

grant references on table "public"."documents" to "anon";

grant select on table "public"."documents" to "anon";

grant trigger on table "public"."documents" to "anon";

grant truncate on table "public"."documents" to "anon";

grant update on table "public"."documents" to "anon";

grant delete on table "public"."documents" to "authenticated";

grant insert on table "public"."documents" to "authenticated";

grant references on table "public"."documents" to "authenticated";

grant select on table "public"."documents" to "authenticated";

grant trigger on table "public"."documents" to "authenticated";

grant truncate on table "public"."documents" to "authenticated";

grant update on table "public"."documents" to "authenticated";

grant delete on table "public"."documents" to "service_role";

grant insert on table "public"."documents" to "service_role";

grant references on table "public"."documents" to "service_role";

grant select on table "public"."documents" to "service_role";

grant trigger on table "public"."documents" to "service_role";

grant truncate on table "public"."documents" to "service_role";

grant update on table "public"."documents" to "service_role";

grant delete on table "public"."repository_setup" to "anon";

grant insert on table "public"."repository_setup" to "anon";

grant references on table "public"."repository_setup" to "anon";

grant select on table "public"."repository_setup" to "anon";

grant trigger on table "public"."repository_setup" to "anon";

grant truncate on table "public"."repository_setup" to "anon";

grant update on table "public"."repository_setup" to "anon";

grant delete on table "public"."repository_setup" to "authenticated";

grant insert on table "public"."repository_setup" to "authenticated";

grant references on table "public"."repository_setup" to "authenticated";

grant select on table "public"."repository_setup" to "authenticated";

grant trigger on table "public"."repository_setup" to "authenticated";

grant truncate on table "public"."repository_setup" to "authenticated";

grant update on table "public"."repository_setup" to "authenticated";

grant delete on table "public"."repository_setup" to "service_role";

grant insert on table "public"."repository_setup" to "service_role";

grant references on table "public"."repository_setup" to "service_role";

grant select on table "public"."repository_setup" to "service_role";

grant trigger on table "public"."repository_setup" to "service_role";

grant truncate on table "public"."repository_setup" to "service_role";

grant update on table "public"."repository_setup" to "service_role";

grant delete on table "public"."workspace_repos" to "anon";

grant insert on table "public"."workspace_repos" to "anon";

grant references on table "public"."workspace_repos" to "anon";

grant select on table "public"."workspace_repos" to "anon";

grant trigger on table "public"."workspace_repos" to "anon";

grant truncate on table "public"."workspace_repos" to "anon";

grant update on table "public"."workspace_repos" to "anon";

grant delete on table "public"."workspace_repos" to "authenticated";

grant insert on table "public"."workspace_repos" to "authenticated";

grant references on table "public"."workspace_repos" to "authenticated";

grant select on table "public"."workspace_repos" to "authenticated";

grant trigger on table "public"."workspace_repos" to "authenticated";

grant truncate on table "public"."workspace_repos" to "authenticated";

grant update on table "public"."workspace_repos" to "authenticated";

grant delete on table "public"."workspace_repos" to "service_role";

grant insert on table "public"."workspace_repos" to "service_role";

grant references on table "public"."workspace_repos" to "service_role";

grant select on table "public"."workspace_repos" to "service_role";

grant trigger on table "public"."workspace_repos" to "service_role";

grant truncate on table "public"."workspace_repos" to "service_role";

grant update on table "public"."workspace_repos" to "service_role";


  create policy "Users can delete their own automation rules"
  on "public"."automation_rules"
  as permissive
  for delete
  to public
using ((user_id = auth.uid()));



  create policy "Users can insert their own automation rules"
  on "public"."automation_rules"
  as permissive
  for insert
  to public
with check ((user_id = auth.uid()));



  create policy "Users can update their own automation rules"
  on "public"."automation_rules"
  as permissive
  for update
  to public
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



  create policy "Users can view their own automation rules"
  on "public"."automation_rules"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "Service role can manage automation runs"
  on "public"."automation_runs"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));



  create policy "Users can insert their own automation runs"
  on "public"."automation_runs"
  as permissive
  for insert
  to public
with check ((user_id = auth.uid()));



  create policy "Users can view their own automation runs"
  on "public"."automation_runs"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "Users can delete document files for their documents"
  on "public"."document_files"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.documents d
  WHERE ((d.id = document_files.document_id) AND public.user_owns_repo(d.source_id)))));



  create policy "Users can insert document files for their documents"
  on "public"."document_files"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.documents d
  WHERE ((d.id = document_files.document_id) AND public.user_owns_repo(d.source_id)))));



  create policy "Users can update document files for their documents"
  on "public"."document_files"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.documents d
  WHERE ((d.id = document_files.document_id) AND public.user_owns_repo(d.source_id)))));



  create policy "Users can view document files for their documents"
  on "public"."document_files"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.documents d
  WHERE ((d.id = document_files.document_id) AND public.user_owns_repo(d.source_id)))));



  create policy "Users can insert document versions for their documents"
  on "public"."document_versions"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.documents d
  WHERE ((d.id = document_versions.document_id) AND public.user_owns_repo(d.source_id)))));



  create policy "Users can view document versions for their documents"
  on "public"."document_versions"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.documents d
  WHERE ((d.id = document_versions.document_id) AND public.user_owns_repo(d.source_id)))));



  create policy "Users can delete their own documents"
  on "public"."documents"
  as permissive
  for delete
  to public
using (public.user_owns_repo(source_id));



  create policy "Users can insert their own documents"
  on "public"."documents"
  as permissive
  for insert
  to public
with check (public.user_owns_repo(source_id));



  create policy "Users can update their own documents"
  on "public"."documents"
  as permissive
  for update
  to public
using (public.user_owns_repo(source_id));



  create policy "Users can view their own documents"
  on "public"."documents"
  as permissive
  for select
  to public
using (public.user_owns_repo(source_id));



  create policy "Users can delete their own repo file summaries"
  on "public"."repo_file_summaries"
  as permissive
  for delete
  to public
using (public.user_owns_repo(repo_id));



  create policy "Users can insert their own repo file summaries"
  on "public"."repo_file_summaries"
  as permissive
  for insert
  to public
with check (public.user_owns_repo(repo_id));



  create policy "Users can update their own repo file summaries"
  on "public"."repo_file_summaries"
  as permissive
  for update
  to public
using (public.user_owns_repo(repo_id))
with check (public.user_owns_repo(repo_id));



  create policy "Users can view file summaries for their repos"
  on "public"."repo_file_summaries"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.workspace_repos wr
  WHERE ((wr.repo_url ~~ (('%'::text || repo_file_summaries.repo_id) || '%'::text)) AND (wr.user_id = auth.uid())))));



  create policy "Users can view their own repo file summaries"
  on "public"."repo_file_summaries"
  as permissive
  for select
  to public
using (public.user_owns_repo(repo_id));



  create policy "Users can insert repository setup for their repos"
  on "public"."repository_setup"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.workspace_repos wr
  WHERE ((wr.id = repository_setup.repo_id) AND (wr.user_id = auth.uid())))));



  create policy "Users can insert their own repository setup"
  on "public"."repository_setup"
  as permissive
  for insert
  to public
with check ((repo_id IN ( SELECT workspace_repos.id
   FROM public.workspace_repos
  WHERE (workspace_repos.user_id = auth.uid()))));



  create policy "Users can update repository setup for their repos"
  on "public"."repository_setup"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.workspace_repos wr
  WHERE ((wr.id = repository_setup.repo_id) AND (wr.user_id = auth.uid())))));



  create policy "Users can update their own repository setup"
  on "public"."repository_setup"
  as permissive
  for update
  to public
using ((repo_id IN ( SELECT workspace_repos.id
   FROM public.workspace_repos
  WHERE (workspace_repos.user_id = auth.uid()))));



  create policy "Users can view repository setup for their repos"
  on "public"."repository_setup"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.workspace_repos wr
  WHERE ((wr.id = repository_setup.repo_id) AND (wr.user_id = auth.uid())))));



  create policy "Users can view their own repository setup"
  on "public"."repository_setup"
  as permissive
  for select
  to public
using ((repo_id IN ( SELECT workspace_repos.id
   FROM public.workspace_repos
  WHERE (workspace_repos.user_id = auth.uid()))));



  create policy "User can access everything"
  on "public"."workspace_repos"
  as permissive
  for all
  to public
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



  create policy "Users can delete their own workspace repos"
  on "public"."workspace_repos"
  as permissive
  for delete
  to public
using ((user_id = auth.uid()));



  create policy "Users can insert their own workspace repos"
  on "public"."workspace_repos"
  as permissive
  for insert
  to public
with check ((user_id = auth.uid()));



  create policy "Users can update their own workspace repos"
  on "public"."workspace_repos"
  as permissive
  for update
  to public
using ((user_id = auth.uid()));



  create policy "Users can view their own workspace repos"
  on "public"."workspace_repos"
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
   FROM public.workspace_repos
  WHERE ((workspace_repos.id = diagrams.repo_id) AND (workspace_repos.user_id = auth.uid())))));



  create policy "Users can delete their own diagrams"
  on "public"."diagrams"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.workspace_repos
  WHERE ((workspace_repos.id = diagrams.repo_id) AND (workspace_repos.user_id = auth.uid())))));



  create policy "Users can update their own diagrams"
  on "public"."diagrams"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.workspace_repos
  WHERE ((workspace_repos.id = diagrams.repo_id) AND (workspace_repos.user_id = auth.uid())))));



  create policy "Users can view their own diagrams"
  on "public"."diagrams"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.workspace_repos
  WHERE ((workspace_repos.id = diagrams.repo_id) AND (workspace_repos.user_id = auth.uid())))));


CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_repository_setup_updated_at BEFORE UPDATE ON public.repository_setup FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


