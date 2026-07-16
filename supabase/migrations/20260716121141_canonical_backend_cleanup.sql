-- Canon's canonical backend cleanup.
--
-- This migration is intentionally idempotent. It is applied to Dev first and
-- then reused to bring Prod to the same schema without copying environment
-- data between projects.

-- Remove the retired Google Chat integration surface.
delete from public.readiness_delivery_targets
where provider = 'google_chat';

delete from public.readiness_source_events
where provider = 'google_chat';

delete from public.knowledge_sources
where provider = 'google_chat';

delete from public.meeting_prep_deliveries
where target_provider = 'google_chat';

delete from public.oauth_connections
where provider = 'google_chat';

drop table if exists public.google_chat_app_installations;

-- Remove legacy tracking tables that the current product no longer uses.
-- These are already absent from Dev and Prod but older local migrations still
-- recreate them on a fresh database.
drop table if exists public.workspace_sources;
drop table if exists public.signal_evidence;
drop table if exists public.signals;
drop table if exists public.signal_runs;
drop table if exists public.diff_event_raw;
drop table if exists public.diff_event_canonical;
drop table if exists public.diff_daily_metrics;
drop table if exists public.usage_events;

alter table public.readiness_delivery_targets
  drop column if exists metadata;

alter table public.knowledge_sources
  drop constraint if exists knowledge_sources_provider_check;

alter table public.knowledge_sources
  add constraint knowledge_sources_provider_check
  check (
    provider in (
      'slack',
      'notion',
      'google_drive',
      'gong',
      'granola',
      'teams',
      'gmail',
      'google_calendar',
      'outlook'
    )
  );

alter table public.readiness_delivery_targets
  drop constraint if exists readiness_delivery_targets_provider_check;

alter table public.readiness_delivery_targets
  add constraint readiness_delivery_targets_provider_check
  check (provider in ('slack', 'teams'));

alter table public.readiness_source_events
  drop constraint if exists readiness_source_events_provider_check;

alter table public.readiness_source_events
  add constraint readiness_source_events_provider_check
  check (
    provider in (
      'slack',
      'granola',
      'teams',
      'gmail',
      'google_calendar',
      'outlook'
    )
  );

alter table public.meeting_prep_deliveries
  drop constraint if exists meeting_prep_deliveries_target_provider_check;

alter table public.meeting_prep_deliveries
  add constraint meeting_prep_deliveries_target_provider_check
  check (target_provider in ('slack', 'teams'));

-- Bring the milestone and meeting-prep schemas to the current Dev target.
alter table public.role_profiles
  add column if not exists baseline_ramp_days integer not null default 90,
  add column if not exists target_ramp_days integer not null default 45;

do $$
begin
  alter table public.role_profiles
    add constraint role_profiles_baseline_ramp_days_check
    check (baseline_ramp_days between 1 and 365);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.role_profiles
    add constraint role_profiles_target_ramp_days_check
    check (target_ramp_days between 1 and baseline_ramp_days);
exception when duplicate_object then null;
end $$;

update public.new_hire_milestone_progress
set status = 'needs_review',
    updated_at = now()
where status = 'evidence_detected';

alter table public.new_hire_milestone_progress
  drop constraint if exists new_hire_milestone_progress_status_check;

alter table public.new_hire_milestone_progress
  add constraint new_hire_milestone_progress_status_check
  check (status in ('not_started', 'briefed', 'needs_review', 'blocked', 'verified'));

create table if not exists public.milestone_check_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  new_hire_id uuid not null references public.new_hires(id) on delete cascade,
  milestone_id uuid references public.ramp_milestones(id) on delete set null,
  trigger_type text not null check (trigger_type in ('scheduled', 'source_sync', 'manual')),
  outcome text not null check (outcome in ('waiting', 'no_proof', 'needs_review', 'verified', 'failed')),
  sources_checked text[] not null default '{}',
  source_event_ids uuid[] not null default '{}',
  activity_checked integer not null default 0 check (activity_checked >= 0),
  summary text not null,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists milestone_check_runs_hire_created_idx
  on public.milestone_check_runs (new_hire_id, created_at desc);

create index if not exists milestone_check_runs_org_outcome_idx
  on public.milestone_check_runs (organization_id, outcome, created_at desc);

create index if not exists milestone_check_runs_milestone_idx
  on public.milestone_check_runs (milestone_id);

alter table public.milestone_check_runs enable row level security;

drop policy if exists "milestone_check_runs_select" on public.milestone_check_runs;
create policy "milestone_check_runs_select" on public.milestone_check_runs
  for select to authenticated
  using (private.user_can_access_hire(new_hire_id));

drop policy if exists "milestone_check_runs_insert" on public.milestone_check_runs;
create policy "milestone_check_runs_insert" on public.milestone_check_runs
  for insert to authenticated
  with check (private.user_can_access_hire(new_hire_id));

drop policy if exists "milestone_check_runs_update" on public.milestone_check_runs;
create policy "milestone_check_runs_update" on public.milestone_check_runs
  for update to authenticated
  using (private.user_can_access_hire(new_hire_id))
  with check (private.user_can_access_hire(new_hire_id));

drop policy if exists "milestone_check_runs_delete" on public.milestone_check_runs;
create policy "milestone_check_runs_delete" on public.milestone_check_runs
  for delete to authenticated
  using (private.is_organization_admin(organization_id));

alter table public.milestone_evidence
  drop constraint if exists milestone_evidence_evidence_type_check;

alter table public.milestone_evidence
  add constraint milestone_evidence_evidence_type_check
  check (
    evidence_type in (
      'access_readiness',
      'tool_activity',
      'communication_activity',
      'customer_exposure',
      'manager_verification',
      'manager_reopened',
      'new_hire_blocker'
    )
  );

alter table public.ramp_deliveries
  drop constraint if exists ramp_deliveries_milestone_id_fkey;

alter table public.ramp_deliveries
  add constraint ramp_deliveries_milestone_id_fkey
  foreign key (milestone_id)
  references public.ramp_milestones(id)
  on delete cascade;

alter table public.meeting_events
  add column if not exists status text not null default 'active'
    check (status in ('active', 'cancelled')),
  add column if not exists connection_id text,
  add column if not exists last_seen_at timestamptz not null default now();

create index if not exists meeting_events_active_upcoming_idx
  on public.meeting_events (organization_id, start_at)
  where status = 'active';

alter table public.meeting_prep_deliveries
  add column if not exists brief_text text,
  add column if not exists attempt_count integer not null default 0
    check (attempt_count >= 0),
  add column if not exists last_attempt_at timestamptz;

create index if not exists meeting_prep_deliveries_recent_idx
  on public.meeting_prep_deliveries (organization_id, updated_at desc);

-- Remove the obsolete Supabase Cron job and its failed-run history.
do $$
declare
  target_job_id bigint;
begin
  if to_regclass('cron.job') is not null then
    for target_job_id in
      select jobid
      from cron.job
      where jobname = 'check-due-rules'
    loop
      perform cron.unschedule(target_job_id);
      delete from cron.job_run_details
      where jobid = target_job_id;
    end loop;
  end if;
end $$;

-- Remove functions left behind by retired repository and diagram systems.
do $$
declare
  function_record record;
begin
  for function_record in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_roles r on r.oid = p.proowner
    where n.nspname = 'public'
      and r.rolname = 'postgres'
      and p.proname = any (
        array[
          '_matches_repo_id',
          'create_diagram_version',
          'find_repo_by_url',
          'find_similar_chunks',
          'full_schema_inventory',
          'get_next_diagram_version',
          'normalize_repo_url_to_id',
          'schema_with_samples',
          'update_repo_file_summaries_updated_at',
          'update_updated_at_column',
          'upsert_diff_daily_metrics',
          'upsert_repo_file_summary',
          'user_owns_repo'
        ]
      )
  loop
    execute format('drop function if exists %s', function_record.signature);
  end loop;
end $$;

-- Keep extensions out of the exposed public schema.
create schema if not exists extensions;

do $$
begin
  if exists (
    select 1
    from pg_extension extension
    join pg_namespace namespace on namespace.oid = extension.extnamespace
    where extension.extname = 'vector'
      and namespace.nspname <> 'extensions'
  ) then
    alter extension vector set schema extensions;
  end if;
end $$;

-- Retain the one active database RPC, scoped to trusted server code.
create or replace function public.match_knowledge_chunks(
  query_embedding extensions.vector,
  organization_id uuid,
  match_threshold double precision default 0.7,
  match_count integer default 5
)
returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    chunk.id,
    chunk.content,
    chunk.metadata,
    1 - (chunk.embedding operator(extensions.<=>) $1) as similarity
  from public.knowledge_chunks as chunk
  where chunk.organization_id = $2
    and chunk.embedding is not null
    and 1 - (chunk.embedding operator(extensions.<=>) $1) > $3
  order by chunk.embedding operator(extensions.<=>) $1
  limit greatest($4, 0);
$$;

-- Fix the search path and grants for private RLS helpers.
do $$
declare
  function_record record;
begin
  for function_record in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_roles r on r.oid = p.proowner
    where n.nspname = 'private'
      and r.rolname = 'postgres'
  loop
    execute format(
      'alter function %s set search_path = %L',
      function_record.signature,
      ''
    );
  end loop;
end $$;

revoke execute on all functions in schema private from public, anon;
grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

alter default privileges for role postgres in schema private
  revoke execute on functions from public, anon;

-- Canon is server-only with Clerk authentication. Keep the Data API available
-- to service_role while removing browser-facing grants.
revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on function public.match_knowledge_chunks(
  extensions.vector,
  uuid,
  double precision,
  integer
) to service_role;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;

alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;

-- Index every foreign-key side so joins and cascades do not require scans.
create index if not exists access_requests_new_hire_id_idx
  on public.access_requests (new_hire_id);

create index if not exists knowledge_chunks_organization_id_idx
  on public.knowledge_chunks (organization_id);

create index if not exists knowledge_chunks_source_id_idx
  on public.knowledge_chunks (source_id);

create index if not exists milestone_evidence_milestone_id_idx
  on public.milestone_evidence (milestone_id);

create index if not exists milestone_evidence_progress_id_idx
  on public.milestone_evidence (progress_id);

create index if not exists milestone_proposals_approved_milestone_id_idx
  on public.milestone_proposals (approved_milestone_id);

create index if not exists new_hire_milestone_progress_milestone_id_idx
  on public.new_hire_milestone_progress (milestone_id);

create index if not exists new_hires_organization_id_idx
  on public.new_hires (organization_id);

create index if not exists onboarding_notifications_milestone_id_idx
  on public.onboarding_notifications (milestone_id);

create index if not exists onboarding_notifications_new_hire_id_idx
  on public.onboarding_notifications (new_hire_id);

create index if not exists org_tools_organization_id_idx
  on public.org_tools (organization_id);

create index if not exists ramp_deliveries_milestone_id_idx
  on public.ramp_deliveries (milestone_id);

create index if not exists ramp_deliveries_new_hire_id_idx
  on public.ramp_deliveries (new_hire_id);

create index if not exists ramp_milestones_organization_id_idx
  on public.ramp_milestones (organization_id);

create index if not exists readiness_items_organization_id_idx
  on public.readiness_items (organization_id);

create index if not exists readiness_source_events_source_id_idx
  on public.readiness_source_events (source_id);

-- The unique constraint already covers this exact key.
drop index if exists public.role_profiles_org_role_idx;

-- Existing Dev and Prod rows have both ownership columns populated.
do $$
begin
  if exists (
    select 1
    from public.knowledge_chunks
    where organization_id is null
      or source_id is null
  ) then
    raise exception 'knowledge_chunks contains rows without organization or source ownership';
  end if;
end $$;

alter table public.knowledge_chunks
  alter column organization_id set not null,
  alter column source_id set not null;

-- Supabase Auth is retired. All references from public tables were removed by
-- the Clerk migration; Auth-owned rows cascade from auth.users.
delete from auth.users;

notify pgrst, 'reload schema';
