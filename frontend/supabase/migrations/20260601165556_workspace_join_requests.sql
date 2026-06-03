create table if not exists public.organization_join_requests (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  requester_id uuid not null,
  requester_email text not null,
  message text null,
  status text not null default 'pending',
  reviewed_by uuid null,
  reviewed_at timestamp with time zone null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint organization_join_requests_pkey primary key (id),
  constraint organization_join_requests_organization_id_fkey foreign key (organization_id) references public.organizations (id) on delete cascade,
  constraint organization_join_requests_requester_id_fkey foreign key (requester_id) references auth.users (id) on delete cascade,
  constraint organization_join_requests_reviewed_by_fkey foreign key (reviewed_by) references auth.users (id) on delete set null,
  constraint organization_join_requests_status_check check (status in ('pending', 'approved', 'denied', 'cancelled'))
);

create unique index if not exists organization_join_requests_pending_unique
  on public.organization_join_requests (organization_id, requester_id)
  where status = 'pending';

create index if not exists organization_join_requests_requester_idx
  on public.organization_join_requests (requester_id, created_at desc);

create index if not exists organization_join_requests_organization_idx
  on public.organization_join_requests (organization_id, status, created_at desc);

alter table public.organization_join_requests enable row level security;

grant select, insert, update, delete on public.organization_join_requests to authenticated;

drop policy if exists "join requests are visible to requester and admins" on public.organization_join_requests;
create policy "join requests are visible to requester and admins"
  on public.organization_join_requests
  for select
  to authenticated
  using (
    requester_id = auth.uid()
    or private.is_organization_admin(organization_id)
  );

drop policy if exists "users can request to join organizations" on public.organization_join_requests;
create policy "users can request to join organizations"
  on public.organization_join_requests
  for insert
  to authenticated
  with check (
    requester_id = auth.uid()
    and status = 'pending'
  );

drop policy if exists "admins can review join requests" on public.organization_join_requests;
create policy "admins can review join requests"
  on public.organization_join_requests
  for update
  to authenticated
  using (private.is_organization_admin(organization_id))
  with check (private.is_organization_admin(organization_id));

drop policy if exists "requesters can cancel pending join requests" on public.organization_join_requests;
create policy "requesters can cancel pending join requests"
  on public.organization_join_requests
  for update
  to authenticated
  using (
    requester_id = auth.uid()
    and status = 'pending'
  )
  with check (
    requester_id = auth.uid()
    and status = 'cancelled'
  );

notify pgrst, 'reload schema';
