alter table public.new_hires
  add column if not exists manager_name text,
  add column if not exists manager_email text,
  add column if not exists manager_slack_user_id text,
  add column if not exists manager_chat_provider text not null default 'slack',
  add column if not exists manager_chat_target_id text;

update public.new_hires
set manager_chat_provider = 'slack'
where manager_chat_provider is null or manager_chat_provider = '';

update public.new_hires
set manager_chat_target_id = manager_slack_user_id
where manager_chat_target_id is null
  and manager_slack_user_id is not null;

alter table public.new_hires
  drop constraint if exists new_hires_manager_chat_provider_check;

alter table public.new_hires
  add constraint new_hires_manager_chat_provider_check
  check (manager_chat_provider in ('slack', 'teams', 'google_chat', 'email'));
