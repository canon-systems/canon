-- Phase II Signals domain tables

create table if not exists public.workspace_signal_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  baseline_window_days integer not null default 7,
  slack_channel text,
  source_ids uuid[] not null default '{}'::uuid[],
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.signal_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trigger_type text not null default 'manual',
  source_ids uuid[] not null default '{}'::uuid[],
  window_start timestamp with time zone not null,
  window_end timestamp with time zone not null,
  baseline_start timestamp with time zone not null,
  baseline_end timestamp with time zone not null,
  signals_count integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  signal_run_id uuid references public.signal_runs(id) on delete cascade,
  type text not null,
  severity text not null,
  scope_type text not null default 'global',
  scope_id text,
  metric_key text not null,
  window_start timestamp with time zone not null,
  window_end timestamp with time zone not null,
  baseline_start timestamp with time zone not null,
  baseline_end timestamp with time zone not null,
  current_value numeric,
  baseline_value numeric,
  absolute_change numeric,
  percent_change numeric,
  title text not null,
  summary_line text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.signal_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  signal_id uuid not null references public.signals(id) on delete cascade,
  evidence_type text not null,
  evidence_id text not null,
  label text,
  rank integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.aku_evidence_refs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  aku_id uuid not null references public.akus(id) on delete cascade,
  source_id uuid references public.workspace_sources(id) on delete cascade,
  provider text not null,
  entity_type text not null,
  entity_id text not null,
  repo_full_name text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (aku_id, provider, entity_type, entity_id)
);

create index if not exists idx_signals_user_created_at_desc on public.signals(user_id, created_at desc);
create index if not exists idx_signals_user_severity_created_at_desc on public.signals(user_id, severity, created_at desc);
create index if not exists idx_signal_evidence_signal_rank on public.signal_evidence(signal_id, rank);
create index if not exists idx_aku_evidence_refs_user_aku on public.aku_evidence_refs(user_id, aku_id);
create index if not exists idx_signal_runs_user_created_at_desc on public.signal_runs(user_id, created_at desc);

alter table public.workspace_signal_settings enable row level security;
alter table public.signal_runs enable row level security;
alter table public.signals enable row level security;
alter table public.signal_evidence enable row level security;
alter table public.aku_evidence_refs enable row level security;

drop policy if exists workspace_signal_settings_owner on public.workspace_signal_settings;
create policy workspace_signal_settings_owner
on public.workspace_signal_settings
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists signal_runs_owner on public.signal_runs;
create policy signal_runs_owner
on public.signal_runs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists signals_owner on public.signals;
create policy signals_owner
on public.signals
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists signal_evidence_owner on public.signal_evidence;
create policy signal_evidence_owner
on public.signal_evidence
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists aku_evidence_refs_owner on public.aku_evidence_refs;
create policy aku_evidence_refs_owner
on public.aku_evidence_refs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant all on table public.workspace_signal_settings to authenticated;
grant all on table public.signal_runs to authenticated;
grant all on table public.signals to authenticated;
grant all on table public.signal_evidence to authenticated;
grant all on table public.aku_evidence_refs to authenticated;

grant all on table public.workspace_signal_settings to service_role;
grant all on table public.signal_runs to service_role;
grant all on table public.signals to service_role;
grant all on table public.signal_evidence to service_role;
grant all on table public.aku_evidence_refs to service_role;
