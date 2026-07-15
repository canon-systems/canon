alter table public.role_profiles
  add column if not exists baseline_ramp_days integer not null default 90,
  add column if not exists target_ramp_days integer not null default 45;

do $$
begin
  alter table public.role_profiles
    add constraint role_profiles_baseline_ramp_days_check
    check (baseline_ramp_days between 1 and 365);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.role_profiles
    add constraint role_profiles_target_ramp_days_check
    check (target_ramp_days between 1 and baseline_ramp_days);
exception when duplicate_object then null;
end $$;

update public.new_hire_milestone_progress
set status = 'needs_review',
    updated_at = now()
where status = 'evidence_detected';

alter table public.new_hire_milestone_progress
  drop constraint if exists new_hire_milestone_progress_status_check;

alter table public.new_hire_milestone_progress
  add constraint new_hire_milestone_progress_status_check
  check (status in ('not_started', 'briefed', 'needs_review', 'blocked', 'verified'));
