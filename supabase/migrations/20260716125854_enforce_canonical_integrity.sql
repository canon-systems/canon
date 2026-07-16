-- Close the final differences between fresh local databases and hosted
-- projects after the backend cleanup.

-- Tokens without a connection cannot be refreshed, disconnected, or scoped
-- safely. Dev has none; the Prod preflight found one legacy orphan.
delete from public.oauth_provider_tokens as token
where not exists (
  select 1
  from public.oauth_connections as connection
  where connection.connection_id = token.connection_id
);

do $$
begin
  alter table public.oauth_provider_tokens
    add constraint oauth_provider_tokens_connection_id_fkey
    foreign key (connection_id)
    references public.oauth_connections(connection_id)
    on delete cascade;
exception when duplicate_object then null;
end $$;

update public.oauth_connections
set created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, now())
where created_at is null or updated_at is null;

alter table public.oauth_connections
  alter column created_at set not null,
  alter column updated_at set not null;

update public.oauth_provider_tokens
set created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, now())
where created_at is null or updated_at is null;

alter table public.oauth_provider_tokens
  alter column created_at set not null,
  alter column updated_at set not null;

-- Left over from a retired reporting surface; no tables, functions, or code
-- depend on this enum in either hosted project.
drop type if exists public.report_schedule_type;

notify pgrst, 'reload schema';
