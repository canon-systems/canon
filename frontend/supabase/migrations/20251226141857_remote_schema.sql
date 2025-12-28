drop policy "Users can delete their own automation results" on "public"."automation_results";

drop policy "Users can insert their own automation results" on "public"."automation_results";

drop policy "Users can update their own automation results" on "public"."automation_results";

drop policy "Users can view their own automation results" on "public"."automation_results";

revoke delete on table "public"."automation_results" from "anon";

revoke insert on table "public"."automation_results" from "anon";

revoke references on table "public"."automation_results" from "anon";

revoke select on table "public"."automation_results" from "anon";

revoke trigger on table "public"."automation_results" from "anon";

revoke truncate on table "public"."automation_results" from "anon";

revoke update on table "public"."automation_results" from "anon";

revoke delete on table "public"."automation_results" from "authenticated";

revoke insert on table "public"."automation_results" from "authenticated";

revoke references on table "public"."automation_results" from "authenticated";

revoke select on table "public"."automation_results" from "authenticated";

revoke trigger on table "public"."automation_results" from "authenticated";

revoke truncate on table "public"."automation_results" from "authenticated";

revoke update on table "public"."automation_results" from "authenticated";

revoke delete on table "public"."automation_results" from "service_role";

revoke insert on table "public"."automation_results" from "service_role";

revoke references on table "public"."automation_results" from "service_role";

revoke select on table "public"."automation_results" from "service_role";

revoke trigger on table "public"."automation_results" from "service_role";

revoke truncate on table "public"."automation_results" from "service_role";

revoke update on table "public"."automation_results" from "service_role";

alter table "public"."automation_results" drop constraint "automation_results_user_id_fkey";

alter table "public"."automation_results" drop constraint "automation_results_pkey";

-- alter table "public"."system_nodes" drop constraint "system_nodes_pkey";

drop index if exists "public"."automation_results_created_at_idx";

drop index if exists "public"."automation_results_pkey";

drop index if exists "public"."automation_results_repo_id_idx";

drop index if exists "public"."automation_results_rule_id_idx";

drop index if exists "public"."automation_results_user_id_idx";

drop index if exists "public"."system_nodes_pkey";

drop table "public"."automation_results";

alter table "public"."automation_runs" add column "generated_diagrams" jsonb default '[]'::jsonb;

alter table "public"."automation_runs" add column "generated_documents" jsonb default '[]'::jsonb;

alter table "public"."automation_runs" add column "preview_url" text;

alter table "public"."automation_runs" add column "significance_analysis" jsonb;

alter table "public"."system_nodes" drop column "priority";

alter table "public"."system_nodes" add column "protocol_schemes" text[] not null default ARRAY[]::text[];

alter table "public"."system_nodes" add column "provider" text;

alter table "public"."system_nodes" add column "service_host_patterns" text[] not null default ARRAY[]::text[];

alter table "public"."system_nodes" add column "surfaces" jsonb not null default '[]'::jsonb;

alter table "public"."system_nodes" enable row level security;

-- Replace line 91 with:
CREATE UNIQUE INDEX IF NOT EXISTS external_targets_pkey ON public.system_nodes USING btree (id);

CREATE INDEX IF NOT EXISTS system_nodes_provider_idx ON public.system_nodes USING btree (provider);

CREATE INDEX IF NOT EXISTS system_nodes_surfaces_gin_idx ON public.system_nodes USING gin (surfaces jsonb_path_ops);

-- alter table "public"."system_nodes" add constraint "external_targets_pkey" PRIMARY KEY using index "external_targets_pkey";


