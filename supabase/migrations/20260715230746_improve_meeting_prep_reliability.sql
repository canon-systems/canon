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

notify pgrst, 'reload schema';
