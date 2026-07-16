export const INNGEST_EVENTS = {
  ACCESS_GRANTED: 'onboarding/access.granted',
  ACCESS_REQUEST_CREATED: 'onboarding/access.request.created',
  CALENDAR_SYNC_REQUESTED: 'onboarding/calendar.sync.requested',
  KNOWLEDGE_SYNC_REQUESTED: 'onboarding/knowledge.sync.requested',
  MEETING_PREP_CHECK_REQUESTED: 'onboarding/meeting-prep.check.requested',
  MILESTONE_EVIDENCE_SCAN_REQUESTED: 'onboarding/milestones.evidence.scan.requested',
  MILESTONE_PROPOSALS_REQUESTED: 'onboarding/milestones.generate.requested',
  READINESS_GENERATE_REQUESTED: 'onboarding/readiness.generate.requested',
} as const;

export const INNGEST_CRONS = {
  CALENDAR_SYNC_DUE_CHECK: '*/15 * * * *',
  DAILY_RAMP_CHECK: '0 9 * * *',
  MEETING_PREP_DUE_CHECK: '*/5 * * * *',
  MILESTONE_EVIDENCE_DUE_CHECK: '*/30 * * * *',
  READINESS_DIGEST_DUE_CHECK: '0 * * * *',
} as const;

export const INNGEST_FUNCTION_IDS = {
  ASK_NEW_HIRE_TO_CONFIRM_TOOL_ACCESS: 'access-granted-notifier',
  CHECK_MEETING_PREP: 'meeting-prep-briefing',
  CHECK_MEETING_PREP_ON_SCHEDULE: 'meeting-prep-briefing-scheduled',
  GENERATE_MILESTONE_PROPOSALS: 'milestone-proposal-generation',
  GENERATE_READINESS_UPDATES_ON_DEMAND: 'readiness-analysis-on-demand',
  NOTIFY_TOOL_OWNER_FOR_ACCESS_REQUEST: 'access-coordinator',
  SCAN_MILESTONE_EVIDENCE: 'milestone-evidence-scan',
  SCAN_MILESTONE_EVIDENCE_ON_SCHEDULE: 'milestone-evidence-scan-scheduled',
  SEND_DUE_READINESS_DIGEST: 'readiness-analysis',
  SEND_NEXT_DUE_RAMP_MILESTONE: 'daily-ramp-check',
  SYNC_CALENDAR_MEETINGS: 'calendar-meeting-sync',
  SYNC_CALENDAR_MEETINGS_ON_SCHEDULE: 'calendar-meeting-sync-scheduled',
  SYNC_KNOWLEDGE_SOURCE: 'knowledge-source-sync',
} as const;
