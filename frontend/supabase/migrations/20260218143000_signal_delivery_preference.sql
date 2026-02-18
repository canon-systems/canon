-- Allow users to choose how signal alerts are delivered.
-- Options: Slack only, Email only, or Slack then Email (both, in that order).

alter table if exists public.workspace_signal_settings
  add column if not exists delivery_preference text not null default 'slack_then_email'
    check (delivery_preference in ('slack_only', 'email_only', 'slack_then_email'));