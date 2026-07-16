alter table public.milestone_evidence
  drop constraint if exists milestone_evidence_evidence_type_check;

alter table public.milestone_evidence
  add constraint milestone_evidence_evidence_type_check
  check (evidence_type in (
    'access_readiness',
    'tool_activity',
    'communication_activity',
    'customer_exposure',
    'manager_verification',
    'manager_reopened',
    'new_hire_blocker'
  ));

notify pgrst, 'reload schema';
