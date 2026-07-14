-- Enforce Clerk Organization ownership for workspace-level domain rows.

alter table public.new_hires
  alter column organization_id set not null;

alter table public.knowledge_sources
  alter column organization_id set not null;

alter table public.ramp_milestones
  alter column organization_id set not null;

drop policy if exists "ramp_milestones_select" on public.ramp_milestones;
create policy "ramp_milestones_select" on public.ramp_milestones
  for select to authenticated
  using (private.is_organization_member(organization_id));

notify pgrst, 'reload schema';
