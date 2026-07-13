-- Reconcile production schema to the current Dev schema.
-- This is intentionally idempotent so it is safe on Dev and on already-synced
-- environments.

create schema if not exists private;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end $$;

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conrelid::regclass as table_name, conname
    from pg_constraint
    where confrelid = 'auth.users'::regclass
      and connamespace = 'public'::regnamespace
  loop
    execute format('alter table %s drop constraint if exists %I', constraint_record.table_name, constraint_record.conname);
  end loop;
end $$;

drop table if exists public.organization_join_requests cascade;
drop table if exists public.organization_invitations cascade;
drop table if exists public.organization_members cascade;

alter table public.organizations
  add column if not exists clerk_org_id text;

update public.organizations
set clerk_org_id = 'legacy:' || slug
where clerk_org_id is null;

alter table public.organizations
  alter column owner_id type text using owner_id::text,
  alter column clerk_org_id set not null;

create unique index if not exists organizations_clerk_org_id_key
  on public.organizations (clerk_org_id);

alter table public.new_hires
  alter column created_by type text using created_by::text,
  alter column organization_id set not null;

alter table public.knowledge_sources
  alter column organization_id set not null;

alter table public.ramp_milestones
  alter column organization_id set not null;

alter table public.milestone_generation_runs
  alter column requested_by type text using requested_by::text;

alter table public.milestone_evidence
  alter column created_by type text using created_by::text;

alter table public.oauth_connections
  add column if not exists organization_id uuid;

alter table public.oauth_provider_tokens
  add column if not exists organization_id uuid;

alter table public.oauth_connections
  alter column user_id type text using user_id::text;

alter table public.oauth_provider_tokens
  alter column user_id type text using user_id::text;

update public.oauth_connections connection
set organization_id = organization.id
from public.organizations organization
where connection.organization_id is null
  and (
    connection.metadata->>'organization_id' = organization.id::text
    or connection.user_id = organization.owner_id
  );

update public.oauth_provider_tokens token
set organization_id = connection.organization_id
from public.oauth_connections connection
where token.organization_id is null
  and token.connection_id = connection.connection_id
  and token.provider = connection.provider
  and connection.organization_id is not null;

do $$
begin
  if exists (select 1 from public.oauth_connections where organization_id is null) then
    raise exception 'Cannot sync schema: oauth_connections has rows without an organization_id mapping';
  end if;

  if exists (select 1 from public.oauth_provider_tokens where organization_id is null) then
    raise exception 'Cannot sync schema: oauth_provider_tokens has rows without an organization_id mapping';
  end if;
end $$;

alter table public.oauth_connections
  alter column organization_id set not null;

alter table public.oauth_provider_tokens
  alter column organization_id set not null;

alter table public.oauth_connections
  drop constraint if exists oauth_connections_organization_id_fkey,
  add constraint oauth_connections_organization_id_fkey
    foreign key (organization_id)
    references public.organizations(id)
    on delete cascade;

alter table public.oauth_provider_tokens
  drop constraint if exists oauth_provider_tokens_organization_id_fkey,
  add constraint oauth_provider_tokens_organization_id_fkey
    foreign key (organization_id)
    references public.organizations(id)
    on delete cascade;

alter table public.oauth_connections
  drop constraint if exists oauth_connections_user_id_provider_key;

drop index if exists public.oauth_connections_user_id_provider_key;

create unique index if not exists oauth_connections_organization_id_provider_key
  on public.oauth_connections (organization_id, provider);

create index if not exists oauth_connections_organization_id_idx
  on public.oauth_connections (organization_id);

create index if not exists oauth_provider_tokens_organization_provider_idx
  on public.oauth_provider_tokens (organization_id, provider);

drop index if exists public.organizations_owner_idx;
drop index if exists public.organization_members_org_role_idx;
drop index if exists public.organization_members_organization_id_user_id_key;
drop index if exists public.organization_members_user_idx;
drop index if exists public.organization_invitations_org_email_idx;
drop index if exists public.organization_invitations_token_idx;
drop index if exists public.organization_invitations_token_key;

alter table public.knowledge_sources
  drop constraint if exists knowledge_sources_provider_check;

alter table public.knowledge_sources
  add constraint knowledge_sources_provider_check
  check (provider in ('slack', 'notion', 'google_drive', 'gong', 'granola'));

drop function if exists private.is_organization_member(uuid, uuid);
drop function if exists private.is_organization_admin(uuid, uuid);
drop function if exists private.user_can_access_hire(uuid, uuid);

create or replace function private.clerk_user_id()
returns text
language sql
stable
as $$
  select auth.jwt()->>'sub';
$$;

create or replace function private.clerk_org_id()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt()->>'org_id', auth.jwt()->'o'->>'id');
$$;

create or replace function private.clerk_org_role()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt()->>'org_role', auth.jwt()->'o'->>'rol');
$$;

create or replace function private.is_organization_member(check_organization_id uuid)
returns boolean
language sql
stable
security invoker
as $$
  select exists (
    select 1
    from public.organizations
    where id = check_organization_id
      and clerk_org_id = private.clerk_org_id()
  );
$$;

create or replace function private.is_organization_admin(check_organization_id uuid)
returns boolean
language sql
stable
security invoker
as $$
  select private.is_organization_member(check_organization_id)
    and private.clerk_org_role() in ('org:admin', 'admin', 'org:owner', 'owner');
$$;

create or replace function private.user_can_access_hire(check_new_hire_id uuid)
returns boolean
language sql
stable
security invoker
as $$
  select exists (
    select 1
    from public.new_hires
    where id = check_new_hire_id
      and private.is_organization_member(organization_id)
  );
$$;

grant usage on schema private to authenticated;
grant execute on function private.clerk_user_id() to authenticated;
grant execute on function private.clerk_org_id() to authenticated;
grant execute on function private.clerk_org_role() to authenticated;
grant execute on function private.is_organization_member(uuid) to authenticated;
grant execute on function private.is_organization_admin(uuid) to authenticated;
grant execute on function private.user_can_access_hire(uuid) to authenticated;

create policy "org_select" on public.organizations
  for select to authenticated
  using (clerk_org_id = private.clerk_org_id());
create policy "org_insert" on public.organizations
  for insert to authenticated
  with check (clerk_org_id = private.clerk_org_id());
create policy "org_update" on public.organizations
  for update to authenticated
  using (clerk_org_id = private.clerk_org_id())
  with check (clerk_org_id = private.clerk_org_id());
create policy "org_delete" on public.organizations
  for delete to authenticated
  using (private.is_organization_admin(id));

create policy "new_hires_select" on public.new_hires
  for select to authenticated using (private.is_organization_member(organization_id));
create policy "new_hires_insert" on public.new_hires
  for insert to authenticated with check (private.is_organization_member(organization_id));
create policy "new_hires_update" on public.new_hires
  for update to authenticated using (private.is_organization_member(organization_id))
  with check (private.is_organization_member(organization_id));
create policy "new_hires_delete" on public.new_hires
  for delete to authenticated using (private.is_organization_admin(organization_id));

create policy "knowledge_sources_select" on public.knowledge_sources
  for select to authenticated using (private.is_organization_member(organization_id));
create policy "knowledge_sources_insert" on public.knowledge_sources
  for insert to authenticated with check (private.is_organization_member(organization_id));
create policy "knowledge_sources_update" on public.knowledge_sources
  for update to authenticated using (private.is_organization_member(organization_id))
  with check (private.is_organization_member(organization_id));
create policy "knowledge_sources_delete" on public.knowledge_sources
  for delete to authenticated using (private.is_organization_admin(organization_id));

create policy "knowledge_chunks_select" on public.knowledge_chunks
  for select to authenticated using (private.is_organization_member(organization_id));
create policy "knowledge_chunks_insert" on public.knowledge_chunks
  for insert to authenticated with check (private.is_organization_member(organization_id));
create policy "knowledge_chunks_update" on public.knowledge_chunks
  for update to authenticated using (private.is_organization_member(organization_id))
  with check (private.is_organization_member(organization_id));
create policy "knowledge_chunks_delete" on public.knowledge_chunks
  for delete to authenticated using (private.is_organization_admin(organization_id));

create policy "ramp_milestones_select" on public.ramp_milestones
  for select to authenticated using (private.is_organization_member(organization_id));
create policy "ramp_milestones_insert" on public.ramp_milestones
  for insert to authenticated with check (private.is_organization_member(organization_id));
create policy "ramp_milestones_update" on public.ramp_milestones
  for update to authenticated using (private.is_organization_member(organization_id))
  with check (private.is_organization_member(organization_id));
create policy "ramp_milestones_delete" on public.ramp_milestones
  for delete to authenticated using (private.is_organization_admin(organization_id));

create policy "ramp_deliveries_select" on public.ramp_deliveries
  for select to authenticated using (private.user_can_access_hire(new_hire_id));
create policy "ramp_deliveries_insert" on public.ramp_deliveries
  for insert to authenticated with check (private.user_can_access_hire(new_hire_id));
create policy "ramp_deliveries_update" on public.ramp_deliveries
  for update to authenticated using (private.user_can_access_hire(new_hire_id))
  with check (private.user_can_access_hire(new_hire_id));
create policy "ramp_deliveries_delete" on public.ramp_deliveries
  for delete to authenticated using (private.user_can_access_hire(new_hire_id));

create policy "access_requests_select" on public.access_requests
  for select to authenticated using (private.user_can_access_hire(new_hire_id));
create policy "access_requests_insert" on public.access_requests
  for insert to authenticated with check (private.user_can_access_hire(new_hire_id));
create policy "access_requests_update" on public.access_requests
  for update to authenticated using (private.user_can_access_hire(new_hire_id))
  with check (private.user_can_access_hire(new_hire_id));
create policy "access_requests_delete" on public.access_requests
  for delete to authenticated using (private.user_can_access_hire(new_hire_id));

create policy "readiness_items_select" on public.readiness_items
  for select to authenticated using (private.is_organization_member(organization_id));
create policy "readiness_items_insert" on public.readiness_items
  for insert to authenticated with check (private.is_organization_member(organization_id));
create policy "readiness_items_update" on public.readiness_items
  for update to authenticated using (private.is_organization_member(organization_id))
  with check (private.is_organization_member(organization_id));
create policy "readiness_items_delete" on public.readiness_items
  for delete to authenticated using (private.is_organization_admin(organization_id));

create policy "role_profiles_select" on public.role_profiles
  for select to authenticated using (private.is_organization_member(organization_id));
create policy "role_profiles_insert" on public.role_profiles
  for insert to authenticated with check (private.is_organization_admin(organization_id));
create policy "role_profiles_update" on public.role_profiles
  for update to authenticated using (private.is_organization_admin(organization_id))
  with check (private.is_organization_admin(organization_id));
create policy "role_profiles_delete" on public.role_profiles
  for delete to authenticated using (private.is_organization_admin(organization_id));

create policy "org_tools_select" on public.org_tools
  for select to authenticated using (private.is_organization_member(organization_id));
create policy "org_tools_insert" on public.org_tools
  for insert to authenticated with check (private.is_organization_admin(organization_id));
create policy "org_tools_update" on public.org_tools
  for update to authenticated using (private.is_organization_admin(organization_id))
  with check (private.is_organization_admin(organization_id));
create policy "org_tools_delete" on public.org_tools
  for delete to authenticated using (private.is_organization_admin(organization_id));

create policy "readiness_delivery_settings_select" on public.readiness_delivery_settings
  for select to authenticated using (private.is_organization_member(organization_id));
create policy "readiness_delivery_settings_insert" on public.readiness_delivery_settings
  for insert to authenticated with check (private.is_organization_admin(organization_id));
create policy "readiness_delivery_settings_update" on public.readiness_delivery_settings
  for update to authenticated using (private.is_organization_admin(organization_id))
  with check (private.is_organization_admin(organization_id));
create policy "readiness_delivery_settings_delete" on public.readiness_delivery_settings
  for delete to authenticated using (private.is_organization_admin(organization_id));

create policy "milestone_generation_runs_select" on public.milestone_generation_runs
  for select to authenticated using (private.is_organization_member(organization_id));
create policy "milestone_generation_runs_insert" on public.milestone_generation_runs
  for insert to authenticated with check (private.is_organization_member(organization_id));
create policy "milestone_generation_runs_update" on public.milestone_generation_runs
  for update to authenticated using (private.is_organization_member(organization_id))
  with check (private.is_organization_member(organization_id));
create policy "milestone_generation_runs_delete" on public.milestone_generation_runs
  for delete to authenticated using (private.is_organization_admin(organization_id));

create policy "milestone_proposals_select" on public.milestone_proposals
  for select to authenticated using (private.is_organization_member(organization_id));
create policy "milestone_proposals_insert" on public.milestone_proposals
  for insert to authenticated with check (private.is_organization_member(organization_id));
create policy "milestone_proposals_update" on public.milestone_proposals
  for update to authenticated using (private.is_organization_member(organization_id))
  with check (private.is_organization_member(organization_id));
create policy "milestone_proposals_delete" on public.milestone_proposals
  for delete to authenticated using (private.is_organization_admin(organization_id));

create policy "new_hire_milestone_progress_select" on public.new_hire_milestone_progress
  for select to authenticated using (private.user_can_access_hire(new_hire_id));
create policy "new_hire_milestone_progress_insert" on public.new_hire_milestone_progress
  for insert to authenticated with check (private.user_can_access_hire(new_hire_id));
create policy "new_hire_milestone_progress_update" on public.new_hire_milestone_progress
  for update to authenticated using (private.user_can_access_hire(new_hire_id))
  with check (private.user_can_access_hire(new_hire_id));
create policy "new_hire_milestone_progress_delete" on public.new_hire_milestone_progress
  for delete to authenticated using (private.user_can_access_hire(new_hire_id));

create policy "milestone_evidence_select" on public.milestone_evidence
  for select to authenticated using (private.user_can_access_hire(new_hire_id));
create policy "milestone_evidence_insert" on public.milestone_evidence
  for insert to authenticated with check (private.user_can_access_hire(new_hire_id));
create policy "milestone_evidence_update" on public.milestone_evidence
  for update to authenticated using (private.user_can_access_hire(new_hire_id))
  with check (private.user_can_access_hire(new_hire_id));
create policy "milestone_evidence_delete" on public.milestone_evidence
  for delete to authenticated using (private.user_can_access_hire(new_hire_id));

create policy "onboarding_notifications_select" on public.onboarding_notifications
  for select to authenticated using (private.is_organization_member(organization_id));
create policy "onboarding_notifications_insert" on public.onboarding_notifications
  for insert to authenticated with check (private.is_organization_member(organization_id));
create policy "onboarding_notifications_update" on public.onboarding_notifications
  for update to authenticated using (private.is_organization_member(organization_id))
  with check (private.is_organization_member(organization_id));
create policy "onboarding_notifications_delete" on public.onboarding_notifications
  for delete to authenticated using (private.is_organization_admin(organization_id));

create policy "oauth_connections_select" on public.oauth_connections
  for select to authenticated
  using (private.is_organization_member(organization_id));

create policy "oauth_connections_insert" on public.oauth_connections
  for insert to authenticated
  with check (private.is_organization_admin(organization_id));

create policy "oauth_connections_update" on public.oauth_connections
  for update to authenticated
  using (private.is_organization_admin(organization_id))
  with check (private.is_organization_admin(organization_id));

create policy "oauth_connections_delete" on public.oauth_connections
  for delete to authenticated
  using (private.is_organization_admin(organization_id));

notify pgrst, 'reload schema';
