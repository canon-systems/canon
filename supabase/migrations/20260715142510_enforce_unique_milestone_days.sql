with ranked_active_milestones as (
  select
    id,
    row_number() over (
      partition by organization_id, role, day_trigger
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as row_rank
  from public.ramp_milestones
  where status = 'active'
)
update public.ramp_milestones milestone
set status = 'archived',
    updated_at = now()
from ranked_active_milestones ranked
where milestone.id = ranked.id
  and ranked.row_rank > 1;

create unique index if not exists ramp_milestones_active_org_role_day_idx
  on public.ramp_milestones (organization_id, role, day_trigger)
  where status = 'active';

with ranked_draft_proposals as (
  select
    id,
    row_number() over (
      partition by organization_id, role, suggested_day_trigger
      order by confidence desc nulls last, updated_at desc nulls last, created_at desc nulls last, id desc
    ) as row_rank
  from public.milestone_proposals
  where status = 'draft'
)
update public.milestone_proposals proposal
set status = 'rejected',
    rejected_at = coalesce(proposal.rejected_at, now()),
    updated_at = now()
from ranked_draft_proposals ranked
where proposal.id = ranked.id
  and ranked.row_rank > 1;

create unique index if not exists milestone_proposals_draft_org_role_day_idx
  on public.milestone_proposals (organization_id, role, suggested_day_trigger)
  where status = 'draft';
