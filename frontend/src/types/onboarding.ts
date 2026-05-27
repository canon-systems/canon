export type HireRole = 'AI Solutions Architect' | 'Solutions Engineer' | 'Implementation Engineer';
export type HireStatus = 'active' | 'paused' | 'completed';
export type KnowledgeProvider = 'slack' | 'notion' | 'google_drive' | 'confluence' | 'gong';
export type KnowledgeSourceStatus = 'pending' | 'syncing' | 'active' | 'error' | 'stopped';
export type DeliveryStatus = 'pending' | 'delivered' | 'failed';
export type AccessRequestStatus = 'pending' | 'sent' | 'acknowledged' | 'granted' | 'confirmed';
export type ReadinessCategory = 'product_change' | 'customer_objection' | 'demo_guidance' | 'implementation_pattern';
export type ReadinessImpactLevel = 'low' | 'medium' | 'high';
export type ReadinessStatus = 'draft' | 'reviewed' | 'sent' | 'archived';
export type MilestoneProposalStatus = 'draft' | 'approved' | 'rejected';
export type MilestoneGenerationRunStatus = 'queued' | 'running' | 'completed' | 'failed';
export type MilestoneProgressStatus = 'not_started' | 'briefed' | 'evidence_detected' | 'verified';
export type MilestoneEvidenceType =
  | 'access_readiness'
  | 'tool_activity'
  | 'communication_activity'
  | 'customer_exposure'
  | 'manager_verification'
  | 'new_hire_blocker';
export type MilestoneEvidenceTrustLevel = 'low' | 'medium' | 'high';
export type OnboardingNotificationType = 'milestone_auto_verified' | 'milestone_needs_review' | 'milestone_blocked';

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

export interface ReadinessCard {
  title: string;
  detail: string;
  category: ReadinessCategory;
}

export interface ReadinessAffectedRole {
  role: HireRole;
  impact: 'High impact' | 'Medium impact' | 'Low impact';
  progress: number;
}

export interface ReadinessHealthStat {
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

export interface Organization {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  created_at: string;
}

export interface NewHire {
  id: string;
  organization_id: string;
  created_by: string;
  first_name: string;
  last_name: string;
  email: string;
  role: HireRole;
  slack_user_id: string | null;
  start_date: string;
  ramp_day: number;
  status: HireStatus;
  created_at: string;
  updated_at: string;
}

export interface NewHireWithCounts extends NewHire {
  delivery_count: number;
  access_request_count: number;
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

export interface KnowledgeChunk {
  id: string;
  organization_id: string;
  source_id: string;
  content: string;
  metadata: Record<string, unknown>;
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

export interface MilestoneEvidence {
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

export interface NewHireMilestoneProgress {
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

export interface OnboardingNotification {
  id: string;
  organization_id: string;
  new_hire_id: string | null;
  milestone_id: string | null;
  type: OnboardingNotificationType;
  title: string;
  body: string;
  delivery_channel: 'app' | 'slack';
  slack_target: string | null;
  slack_sent_at: string | null;
  read_at: string | null;
  created_at: string;
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

export interface NewHireDetail extends NewHire {
  deliveries: RampDelivery[];
  access_requests: AccessRequest[];
  next_milestone: RampMilestone | null;
  milestone_path: NewHireMilestonePathItem[];
}
