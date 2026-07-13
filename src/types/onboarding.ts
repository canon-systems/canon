export type HireRole = string;
export type HireStatus = 'active' | 'paused' | 'completed';
export type KnowledgeProvider = 'slack' | 'granola' | 'teams' | 'google_chat' | 'gmail' | 'google_calendar' | 'outlook';
type KnowledgeSourceStatus = 'pending' | 'syncing' | 'active' | 'error' | 'stopped';
type DeliveryStatus = 'pending' | 'delivered' | 'failed';
type AccessRequestStatus = 'pending' | 'sent' | 'acknowledged' | 'granted' | 'confirmed';
export type ReadinessCategory = 'product_change' | 'customer_objection' | 'demo_guidance' | 'implementation_pattern';
export type ReadinessImpactLevel = 'low' | 'medium' | 'high';
export type ReadinessStatus = 'draft' | 'reviewed' | 'sent' | 'archived';
export type ReadinessDeliveryProvider = 'slack' | 'teams' | 'google_chat';
export type ReadinessDeliveryTargetType = 'channel' | 'dm';
export type ReadinessSourceType = 'team_chat' | 'transcript' | 'email' | 'calendar';
export type ReadinessSourceEventStatus = 'pending' | 'processed' | 'ignored' | 'error';
export type ReadinessObservationStatus = 'active' | 'sent' | 'archived';
type MilestoneProposalStatus = 'draft' | 'approved' | 'rejected';
type MilestoneGenerationRunStatus = 'queued' | 'running' | 'completed' | 'failed';
type MilestoneProgressStatus = 'not_started' | 'briefed' | 'evidence_detected' | 'verified';
export type MilestoneEvidenceType =
  | 'access_readiness'
  | 'tool_activity'
  | 'communication_activity'
  | 'customer_exposure'
  | 'manager_verification'
  | 'new_hire_blocker';
export type MilestoneEvidenceTrustLevel = 'low' | 'medium' | 'high';

export interface MilestoneSourceEvidence {
  provider: string;
  label: string | null;
  url: string | null;
  metadata?: Record<string, unknown>;
}

export interface MilestoneEvidenceRequirement {
  type: MilestoneEvidenceType;
  label: string;
  required?: boolean;
  trust_level?: MilestoneEvidenceTrustLevel;
  metadata?: Record<string, unknown>;
}

interface ReadinessCard {
  title: string;
  detail: string;
  category: ReadinessCategory;
}

export interface ReadinessAffectedRole {
  role: HireRole;
  impact: 'High impact' | 'Medium impact' | 'Low impact';
  progress: number;
}

interface ReadinessHealthStat {
  label: string;
  value: string;
}

export interface ReadinessItem {
  id: string;
  organization_id: string;
  category: ReadinessCategory;
  title: string;
  summary: string;
  recommended_action: string | null;
  impact_level: ReadinessImpactLevel;
  affected_roles: HireRole[];
  source: string | null;
  source_url: string | null;
  source_metadata: Record<string, unknown>;
  status: ReadinessStatus;
  detected_at: string;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReadinessDeliveryTarget {
  id: string;
  organization_id: string;
  provider: ReadinessDeliveryProvider;
  target_type: ReadinessDeliveryTargetType;
  target_id: string;
  target_name: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReadinessDeliverySettings {
  organization_id: string;
  weekly_digest_enabled: boolean;
  digest_weekday: number;
  digest_hour_utc: number;
  meeting_prep_enabled: boolean;
  meeting_prep_minutes_before: number;
  last_digest_sent_at: string | null;
  channel_ids?: string[];
  channel_names?: string[];
  slack_user_ids?: string[];
}

export interface ReadinessSourceEvent {
  id: string;
  organization_id: string;
  provider: KnowledgeProvider;
  source_type: ReadinessSourceType;
  source_id: string | null;
  external_id: string;
  content_hash: string;
  content: string;
  occurred_at: string | null;
  processed_at: string | null;
  status: ReadinessSourceEventStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ReadinessObservation {
  id: string;
  organization_id: string;
  category: ReadinessCategory;
  title: string;
  summary: string;
  recommended_action: string | null;
  impact_level: ReadinessImpactLevel;
  affected_roles: HireRole[];
  source_event_ids: string[];
  source_hashes: string[];
  dedupe_key: string;
  status: ReadinessObservationStatus;
  last_sent_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface MeetingEvent {
  id: string;
  organization_id: string;
  provider: 'google_calendar' | 'outlook';
  external_id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  organizer: string | null;
  attendees: string[];
  meeting_url: string | null;
  customer_domain: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface RoleProfile {
  id: string;
  organization_id: string;
  role: HireRole;
  job_description: string;
  status: 'active' | 'archived';
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeSource {
  id: string;
  organization_id: string;
  provider: KnowledgeProvider;
  name: string;
  slack_channel_id: string | null;
  slack_channel_name: string | null;
  status: KnowledgeSourceStatus;
  last_synced_at: string | null;
  chunk_count: number;
  error_message: string | null;
  created_at: string;
}

export interface RampMilestone {
  id: string;
  organization_id: string | null;
  role: HireRole;
  day_trigger: number;
  title: string;
  description: string;
  knowledge_query: string;
  capability_outcome: string | null;
  briefing_goal: string | null;
  real_work_trigger: string | null;
  success_signals: string[];
  retrieval_brief: string | null;
  evidence_requirements: MilestoneEvidenceRequirement[];
  source_evidence: MilestoneSourceEvidence[];
  confidence: number;
  status: 'active' | 'archived';
  approved_from_proposal_id: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface MilestoneProposal {
  id: string;
  organization_id: string;
  role: HireRole;
  suggested_day_trigger: number;
  title: string;
  capability_outcome: string;
  briefing_goal: string;
  real_work_trigger: string;
  success_signals: string[];
  retrieval_brief: string;
  evidence_requirements: MilestoneEvidenceRequirement[];
  source_evidence: MilestoneSourceEvidence[];
  rationale: string | null;
  confidence: number;
  normalized_key: string;
  status: MilestoneProposalStatus;
  approved_milestone_id: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MilestoneGenerationRun {
  id: string;
  organization_id: string;
  requested_by: string | null;
  status: MilestoneGenerationRunStatus;
  proposals_created: number;
  roles_processed: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MilestoneEvidence {
  id: string;
  progress_id: string | null;
  new_hire_id: string;
  milestone_id: string;
  evidence_type: MilestoneEvidenceType;
  trust_level: MilestoneEvidenceTrustLevel;
  confidence: number;
  source: string;
  source_event_id: string | null;
  source_url: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

interface NewHireMilestoneProgress {
  id: string;
  new_hire_id: string;
  milestone_id: string;
  status: MilestoneProgressStatus;
  current_confidence: number;
  first_briefed_at: string | null;
  last_evidence_at: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewHireMilestonePathItem {
  milestone: RampMilestone;
  progress: NewHireMilestoneProgress | null;
  evidence: MilestoneEvidence[];
  access_ready: boolean;
  required_tools: string[];
}

export interface RampDelivery {
  id: string;
  new_hire_id: string;
  milestone_id: string | null;
  delivery_status: DeliveryStatus;
  delivery_channel: string;
  content_delivered: string | null;
  slack_ts: string | null;
  delivered_at: string | null;
  error_message: string | null;
  created_at: string;
  milestone?: RampMilestone;
}

export interface AccessRequest {
  id: string;
  new_hire_id: string;
  tool_name: string;
  requested_from_name: string | null;
  requested_from_email: string | null;
  requested_from_slack_id: string | null;
  status: AccessRequestStatus;
  sent_at: string | null;
  resent_at: string | null;
  granted_at: string | null;
  confirmed_at: string | null;
  created_at: string;
}

export interface OrgTool {
  id: string;
  organization_id: string;
  tool_name: string;
  role: HireRole | null;
  owner_name: string | null;
  owner_email: string | null;
  owner_slack_id: string | null;
  created_at: string;
}

export interface ReadinessBrief {
  title: string;
  subtitle: string;
  detected_shift: string;
  bullets: string[];
  cards: ReadinessCard[];
  affected_roles: ReadinessAffectedRole[];
  health_stats: ReadinessHealthStat[];
  items: ReadinessItem[];
}

export interface SourceOption {
  id: string;
  name: string;
  provider?: KnowledgeProvider;
  member_count: number;
  topic: string;
}
