create table public.calendar_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  provider text not null check (provider in ('google_calendar', 'outlook')),
  external_id text not null,
  calendar_type text not null check (calendar_type in ('primary', 'calendar', 'group')),
  display_name text not null,
  enabled boolean not null default false,
  is_default boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_sources_connection_fkey
    foreign key (organization_id, provider)
    references public.oauth_connections (organization_id, provider)
    on delete cascade,
  unique (organization_id, provider, calendar_type, external_id)
);

create index calendar_sources_enabled_idx
  on public.calendar_sources (organization_id, provider)
  where enabled;

alter table public.calendar_sources enable row level security;

grant select on table public.calendar_sources to authenticated;
grant select, insert, update, delete on table public.calendar_sources to service_role;

create policy "calendar_sources_select" on public.calendar_sources
  for select to authenticated
  using (private.is_organization_member(organization_id));

create policy "calendar_sources_insert" on public.calendar_sources
  for insert to authenticated
  with check (private.is_organization_admin(organization_id));

create policy "calendar_sources_update" on public.calendar_sources
  for update to authenticated
  using (private.is_organization_admin(organization_id))
  with check (private.is_organization_admin(organization_id));

create policy "calendar_sources_delete" on public.calendar_sources
  for delete to authenticated
  using (private.is_organization_admin(organization_id));

alter table public.meeting_events
  add column calendar_source_id uuid
    references public.calendar_sources(id)
    on delete cascade;

create index meeting_events_calendar_source_idx
  on public.meeting_events (calendar_source_id, start_at)
  where calendar_source_id is not null;

notify pgrst, 'reload schema';
