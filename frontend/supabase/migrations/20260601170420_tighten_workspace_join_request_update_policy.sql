drop policy if exists "requesters and admins can update join requests" on public.organization_join_requests;
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
