-- Move optional legacy event tables from Supabase Auth user ownership to
-- Clerk Organization ownership. These tables may not exist in fresh dev
-- databases, so every operation is guarded.

do $$
declare
  tenant_table text;
  user_attnum smallint;
  fk_name text;
begin
  foreach tenant_table in array array['usage_events', 'signal_runs', 'signals', 'signal_evidence']
  loop
    if to_regclass(format('public.%I', tenant_table)) is not null then
      execute format(
        'alter table public.%I add column if not exists organization_id uuid references public.organizations(id) on delete cascade',
        tenant_table
      );

      select attnum
      into user_attnum
      from pg_attribute
      where attrelid = format('public.%I', tenant_table)::regclass
        and attname = 'user_id'
        and not attisdropped;

      if user_attnum is not null then
        for fk_name in
          select conname
          from pg_constraint
          where conrelid = format('public.%I', tenant_table)::regclass
            and contype = 'f'
            and user_attnum = any(conkey)
        loop
          execute format('alter table public.%I drop constraint if exists %I', tenant_table, fk_name);
        end loop;

        execute format('alter table public.%I alter column user_id drop not null', tenant_table);
      end if;
    end if;
  end loop;
end $$;

do $$
begin
  if to_regclass('public.usage_events') is not null then
    update public.usage_events event
    set organization_id = organization.id
    from public.organizations organization
    where event.organization_id is null
      and event.user_id is not null
      and (
        event.user_id::text = organization.id::text
        or event.user_id::text = organization.owner_id
      );
  end if;

  if to_regclass('public.signal_runs') is not null then
    update public.signal_runs run
    set organization_id = organization.id
    from public.organizations organization
    where run.organization_id is null
      and run.user_id is not null
      and (
        run.user_id::text = organization.id::text
        or run.user_id::text = organization.owner_id
      );
  end if;

  if to_regclass('public.signals') is not null then
    update public.signals signal
    set organization_id = run.organization_id
    from public.signal_runs run
    where signal.organization_id is null
      and signal.signal_run_id = run.id
      and run.organization_id is not null;

    update public.signals signal
    set organization_id = organization.id
    from public.organizations organization
    where signal.organization_id is null
      and signal.user_id is not null
      and (
        signal.user_id::text = organization.id::text
        or signal.user_id::text = organization.owner_id
      );
  end if;

  if to_regclass('public.signal_evidence') is not null then
    update public.signal_evidence evidence
    set organization_id = signal.organization_id
    from public.signals signal
    where evidence.organization_id is null
      and evidence.signal_id = signal.id
      and signal.organization_id is not null;

    update public.signal_evidence evidence
    set organization_id = organization.id
    from public.organizations organization
    where evidence.organization_id is null
      and evidence.user_id is not null
      and (
        evidence.user_id::text = organization.id::text
        or evidence.user_id::text = organization.owner_id
      );
  end if;
end $$;

do $$
declare
  tenant_table text;
begin
  foreach tenant_table in array array['usage_events', 'signal_runs', 'signals', 'signal_evidence']
  loop
    if to_regclass(format('public.%I', tenant_table)) is not null then
      execute format('delete from public.%I where organization_id is null', tenant_table);
      execute format('alter table public.%I alter column organization_id set not null', tenant_table);
      execute format('create index if not exists %I on public.%I (organization_id, created_at desc)', tenant_table || '_organization_created_idx', tenant_table);
    end if;
  end loop;
end $$;

do $$
declare
  tenant_table text;
begin
  foreach tenant_table in array array['usage_events', 'signal_runs', 'signals', 'signal_evidence']
  loop
    if to_regclass(format('public.%I', tenant_table)) is not null then
      execute format('drop policy if exists %I on public.%I', tenant_table || '_user_all', tenant_table);
      execute format('drop policy if exists %I on public.%I', tenant_table || '_organization_all', tenant_table);
      execute format(
        'create policy %I on public.%I for all to authenticated using (private.is_organization_member(organization_id)) with check (private.is_organization_member(organization_id))',
        tenant_table || '_organization_all',
        tenant_table
      );
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
