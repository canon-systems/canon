-- Add optional email digest delivery settings for weekly signal summaries.

alter table if exists public.workspace_signal_settings
  add column if not exists email_digest_enabled boolean not null default false;

alter table if exists public.workspace_signal_settings
  add column if not exists email_digest_to text;
