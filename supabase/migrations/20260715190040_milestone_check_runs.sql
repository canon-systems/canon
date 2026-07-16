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

alter table public.milestone_check_runs enable row level security;

grant select, insert, update, delete on public.milestone_check_runs to service_role;

drop policy if exists "milestone_check_runs_select" on public.milestone_check_runs;
create policy "milestone_check_runs_select" on public.milestone_check_runs
  for select to authenticated using (private.user_can_access_hire(new_hire_id));

drop policy if exists "milestone_check_runs_insert" on public.milestone_check_runs;
create policy "milestone_check_runs_insert" on public.milestone_check_runs
  for insert to authenticated with check (private.user_can_access_hire(new_hire_id));

drop policy if exists "milestone_check_runs_update" on public.milestone_check_runs;
create policy "milestone_check_runs_update" on public.milestone_check_runs
  for update to authenticated using (private.user_can_access_hire(new_hire_id))
  with check (private.user_can_access_hire(new_hire_id));

drop policy if exists "milestone_check_runs_delete" on public.milestone_check_runs;
create policy "milestone_check_runs_delete" on public.milestone_check_runs
  for delete to authenticated using (private.is_organization_admin(organization_id));

notify pgrst, 'reload schema';
