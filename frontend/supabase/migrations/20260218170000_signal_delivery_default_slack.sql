-- Set Slack as the default delivery preference for new rows.

alter table if exists public.workspace_signal_settings
  alter column delivery_preference set default 'slack_only';
