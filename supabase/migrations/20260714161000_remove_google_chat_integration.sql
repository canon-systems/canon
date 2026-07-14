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

alter table public.readiness_delivery_targets
  drop column if exists metadata;

alter table public.knowledge_sources
  drop constraint if exists knowledge_sources_provider_check;

alter table public.knowledge_sources
  add constraint knowledge_sources_provider_check
  check (provider in ('slack', 'notion', 'google_drive', 'gong', 'granola', 'teams', 'gmail', 'google_calendar', 'outlook'));

alter table public.readiness_delivery_targets
  drop constraint if exists readiness_delivery_targets_provider_check;

alter table public.readiness_delivery_targets
  add constraint readiness_delivery_targets_provider_check
  check (provider in ('slack', 'teams'));

alter table public.readiness_source_events
  drop constraint if exists readiness_source_events_provider_check;

alter table public.readiness_source_events
  add constraint readiness_source_events_provider_check
  check (provider in ('slack', 'granola', 'teams', 'gmail', 'google_calendar', 'outlook'));

alter table public.meeting_prep_deliveries
  drop constraint if exists meeting_prep_deliveries_target_provider_check;

alter table public.meeting_prep_deliveries
  add constraint meeting_prep_deliveries_target_provider_check
  check (target_provider in ('slack', 'teams'));

