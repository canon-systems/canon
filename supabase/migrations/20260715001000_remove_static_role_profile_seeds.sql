delete from public.role_profiles profile
where profile.role in ('AI Solutions Architect', 'Solutions Engineer', 'Implementation Engineer')
  and coalesce(nullif(trim(profile.job_description), ''), '') = ''
  and not exists (
    select 1
    from public.new_hires hire
    where hire.organization_id = profile.organization_id
      and hire.role = profile.role
  )
  and not exists (
    select 1
    from public.ramp_milestones milestone
    where milestone.organization_id = profile.organization_id
      and milestone.role = profile.role
  )
  and not exists (
    select 1
    from public.milestone_proposals proposal
    where proposal.organization_id = profile.organization_id
      and proposal.role = profile.role
  )
  and not exists (
    select 1
    from public.org_tools tool
    where tool.organization_id = profile.organization_id
      and tool.role = profile.role
  );
