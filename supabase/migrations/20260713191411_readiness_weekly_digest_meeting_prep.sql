alter table public.readiness_delivery_settings
  add column if not exists weekly_digest_enabled boolean not null default true,
  add column if not exists digest_weekday smallint not null default 1 check (digest_weekday between 0 and 6),
  add column if not exists digest_hour_utc smallint not null default 13 check (digest_hour_utc between 0 and 23),
  add column if not exists meeting_prep_enabled boolean not null default true,
  add column if not exists meeting_prep_minutes_before integer not null default 45 check (meeting_prep_minutes_before between 5 and 240),
  add column if not exists last_digest_sent_at timestamptz;

alter table public.knowledge_sources
  drop constraint if exists knowledge_sources_provider_check;

alter table public.knowledge_sources
  add constraint knowledge_sources_provider_check
  check (provider in ('slack', 'notion', 'google_drive', 'gong', 'granola', 'teams', 'google_chat', 'gmail', 'google_calendar', 'outlook'));

create table if not exists public.readiness_delivery_targets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('slack', 'teams', 'google_chat')),
  target_type text not null check (target_type in ('channel', 'dm')),
  target_id text not null,
  target_name text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, target_type, target_id)
);

create index if not exists readiness_delivery_targets_org_enabled_idx
  on public.readiness_delivery_targets (organization_id, enabled);

create table if not exists public.readiness_source_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('slack', 'granola', 'teams', 'google_chat', 'gmail', 'google_calendar', 'outlook')),
  source_type text not null check (source_type in ('team_chat', 'transcript', 'email', 'calendar')),
  source_id uuid references public.knowledge_sources(id) on delete set null,
  external_id text not null,
  content_hash text not null,
  content text not null,
  occurred_at timestamptz,
  processed_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'processed', 'ignored', 'error')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, external_id, content_hash)
);

create index if not exists readiness_source_events_pending_idx
  on public.readiness_source_events (organization_id, status, occurred_at desc nulls last);

create index if not exists readiness_source_events_content_hash_idx
  on public.readiness_source_events (organization_id, content_hash);

create table if not exists public.readiness_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category text not null check (category in ('product_change', 'customer_objection', 'demo_guidance', 'implementation_pattern')),
  title text not null,
  summary text not null,
  recommended_action text,
  impact_level text not null default 'medium' check (impact_level in ('low', 'medium', 'high')),
  affected_roles text[] not null default '{}',
  source_event_ids uuid[] not null default '{}',
  source_hashes text[] not null default '{}',
  dedupe_key text not null,
  status text not null default 'active' check (status in ('active', 'sent', 'archived')),
  last_sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, dedupe_key)
);

create index if not exists readiness_observations_org_status_impact_idx
  on public.readiness_observations (organization_id, status, impact_level, updated_at desc);

create table if not exists public.meeting_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('google_calendar', 'outlook')),
  external_id text not null,
  title text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz,
  organizer text,
  attendees text[] not null default '{}',
  meeting_url text,
  customer_domain text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, external_id)
);

create index if not exists meeting_events_upcoming_idx
  on public.meeting_events (organization_id, start_at);

create table if not exists public.meeting_prep_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  meeting_event_id uuid not null references public.meeting_events(id) on delete cascade,
  target_provider text not null check (target_provider in ('slack', 'teams', 'google_chat')),
  target_id text not null,
  target_name text,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'skipped', 'failed')),
  reason text,
  delivered_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meeting_event_id, target_provider, target_id)
);

create index if not exists meeting_prep_deliveries_org_status_idx
  on public.meeting_prep_deliveries (organization_id, status);

insert into public.readiness_delivery_targets (
  organization_id,
  provider,
  target_type,
  target_id,
  target_name,
  enabled
)
select
  settings.organization_id,
  'slack',
  'channel',
  channel_id,
  nullif(channel_name, ''),
  true
from public.readiness_delivery_settings settings
cross join lateral unnest(settings.channel_ids) with ordinality as channel_values(channel_id, ordinal)
left join lateral (
  select settings.channel_names[channel_values.ordinal] as channel_name
) channel_names on true
where channel_id is not null and length(trim(channel_id)) > 0
on conflict (organization_id, provider, target_type, target_id)
do update set
  target_name = excluded.target_name,
  enabled = true,
  updated_at = now();

insert into public.readiness_delivery_targets (
  organization_id,
  provider,
  target_type,
  target_id,
  target_name,
  enabled
)
select
  settings.organization_id,
  'slack',
  'dm',
  user_id,
  null,
  true
from public.readiness_delivery_settings settings
cross join lateral unnest(settings.slack_user_ids) as user_values(user_id)
where user_id is not null and length(trim(user_id)) > 0
on conflict (organization_id, provider, target_type, target_id)
do update set
  enabled = true,
  updated_at = now();

alter table public.readiness_delivery_targets enable row level security;
alter table public.readiness_source_events enable row level security;
alter table public.readiness_observations enable row level security;
alter table public.meeting_events enable row level security;
alter table public.meeting_prep_deliveries enable row level security;

drop policy if exists "readiness_delivery_targets_select" on public.readiness_delivery_targets;
create policy "readiness_delivery_targets_select" on public.readiness_delivery_targets
  for select to authenticated using (private.is_organization_member(organization_id));

drop policy if exists "readiness_delivery_targets_insert" on public.readiness_delivery_targets;
create policy "readiness_delivery_targets_insert" on public.readiness_delivery_targets
  for insert to authenticated with check (private.is_organization_admin(organization_id));

drop policy if exists "readiness_delivery_targets_update" on public.readiness_delivery_targets;
create policy "readiness_delivery_targets_update" on public.readiness_delivery_targets
  for update to authenticated using (private.is_organization_admin(organization_id))
  with check (private.is_organization_admin(organization_id));

drop policy if exists "readiness_delivery_targets_delete" on public.readiness_delivery_targets;
create policy "readiness_delivery_targets_delete" on public.readiness_delivery_targets
  for delete to authenticated using (private.is_organization_admin(organization_id));

drop policy if exists "readiness_source_events_select" on public.readiness_source_events;
create policy "readiness_source_events_select" on public.readiness_source_events
  for select to authenticated using (private.is_organization_member(organization_id));

drop policy if exists "readiness_source_events_insert" on public.readiness_source_events;
create policy "readiness_source_events_insert" on public.readiness_source_events
  for insert to authenticated with check (private.is_organization_member(organization_id));

drop policy if exists "readiness_source_events_update" on public.readiness_source_events;
create policy "readiness_source_events_update" on public.readiness_source_events
  for update to authenticated using (private.is_organization_member(organization_id))
  with check (private.is_organization_member(organization_id));

drop policy if exists "readiness_source_events_delete" on public.readiness_source_events;
create policy "readiness_source_events_delete" on public.readiness_source_events
  for delete to authenticated using (private.is_organization_admin(organization_id));

drop policy if exists "readiness_observations_select" on public.readiness_observations;
create policy "readiness_observations_select" on public.readiness_observations
  for select to authenticated using (private.is_organization_member(organization_id));

drop policy if exists "readiness_observations_insert" on public.readiness_observations;
create policy "readiness_observations_insert" on public.readiness_observations
  for insert to authenticated with check (private.is_organization_member(organization_id));

drop policy if exists "readiness_observations_update" on public.readiness_observations;
create policy "readiness_observations_update" on public.readiness_observations
  for update to authenticated using (private.is_organization_member(organization_id))
  with check (private.is_organization_member(organization_id));

drop policy if exists "readiness_observations_delete" on public.readiness_observations;
create policy "readiness_observations_delete" on public.readiness_observations
  for delete to authenticated using (private.is_organization_admin(organization_id));

drop policy if exists "meeting_events_select" on public.meeting_events;
create policy "meeting_events_select" on public.meeting_events
  for select to authenticated using (private.is_organization_member(organization_id));

drop policy if exists "meeting_events_insert" on public.meeting_events;
create policy "meeting_events_insert" on public.meeting_events
  for insert to authenticated with check (private.is_organization_member(organization_id));

drop policy if exists "meeting_events_update" on public.meeting_events;
create policy "meeting_events_update" on public.meeting_events
  for update to authenticated using (private.is_organization_member(organization_id))
  with check (private.is_organization_member(organization_id));

drop policy if exists "meeting_events_delete" on public.meeting_events;
create policy "meeting_events_delete" on public.meeting_events
  for delete to authenticated using (private.is_organization_admin(organization_id));

drop policy if exists "meeting_prep_deliveries_select" on public.meeting_prep_deliveries;
create policy "meeting_prep_deliveries_select" on public.meeting_prep_deliveries
  for select to authenticated using (private.is_organization_member(organization_id));

drop policy if exists "meeting_prep_deliveries_insert" on public.meeting_prep_deliveries;
create policy "meeting_prep_deliveries_insert" on public.meeting_prep_deliveries
  for insert to authenticated with check (private.is_organization_member(organization_id));

drop policy if exists "meeting_prep_deliveries_update" on public.meeting_prep_deliveries;
create policy "meeting_prep_deliveries_update" on public.meeting_prep_deliveries
  for update to authenticated using (private.is_organization_member(organization_id))
  with check (private.is_organization_member(organization_id));

drop policy if exists "meeting_prep_deliveries_delete" on public.meeting_prep_deliveries;
create policy "meeting_prep_deliveries_delete" on public.meeting_prep_deliveries
  for delete to authenticated using (private.is_organization_admin(organization_id));

notify pgrst, 'reload schema';
