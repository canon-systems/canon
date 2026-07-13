-- Make integrations workspace-owned.
-- Clerk remains the identity provider; Canon's organization row is the tenant boundary.

alter table public.oauth_connections
  add column if not exists organization_id uuid;

alter table public.oauth_provider_tokens
  add column if not exists organization_id uuid;

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

drop policy if exists "oauth_connections_user_all" on public.oauth_connections;
drop policy if exists "oauth_provider_tokens_user_all" on public.oauth_provider_tokens;
drop policy if exists "oauth_connections_select" on public.oauth_connections;
drop policy if exists "oauth_connections_insert" on public.oauth_connections;
drop policy if exists "oauth_connections_update" on public.oauth_connections;
drop policy if exists "oauth_connections_delete" on public.oauth_connections;
drop policy if exists "oauth_provider_tokens_service_only" on public.oauth_provider_tokens;

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
