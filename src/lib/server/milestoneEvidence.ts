import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  MilestoneEvidenceTrustLevel,
  MilestoneEvidenceType,
  MilestoneEvidenceRequirement,
} from '@/types/onboarding';
import { createLogger } from '@/lib/server/logging';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getSlackBotTokenForOrganization, postSlackMessage } from '@/lib/server/slack/transport';
import {
  isAccessStatusConfirmed,
  isAccessStatusGranted,
  normalizeToolName,
  progressStatusForEvidence,
  requiredToolsForEvidence,
} from '@/lib/onboarding/milestone-ramp';

type DbClient = SupabaseClient;

const log = createLogger('server.milestone_evidence', {
  label: 'Milestone Evidence',
  eventLabels: {
    evidence_rejected: 'Evidence Rejected',
    progress_update_failed: 'Progress Update Failed',
    evidence_write_failed: 'Evidence Write Failed',
    notification_write_failed: 'Notification Write Failed',
    evidence_recorded: 'Evidence Recorded',
  },
});

type RecordEvidenceParams = {
  supabase: DbClient;
  newHireId: string;
  milestoneId: string;
  evidenceType: MilestoneEvidenceType;
  trustLevel: MilestoneEvidenceTrustLevel;
  confidence?: number;
  source: string;
  sourceEventId?: string | null;
  sourceUrl?: string | null;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
};

function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, value));
}

function confidenceForTrust(trustLevel: MilestoneEvidenceTrustLevel) {
  if (trustLevel === 'high') return 0.92;
  if (trustLevel === 'medium') return 0.65;
  return 0.35;
}

async function maybeSendSlackNotification(params: {
  botToken: string | null;
  target: string | null;
  title: string;
  body: string;
}) {
  if (!params.botToken || !params.target) return false;

  const result = await postSlackMessage({
    botToken: params.botToken,
    channel: params.target,
    text: `*${params.title}*\n${params.body}`,
  });

  return result.ok;
}

function notificationCopy(params: {
  hireName: string;
  milestoneTitle: string;
  evidenceType: MilestoneEvidenceType;
  verified: boolean;
}) {
  if (params.evidenceType === 'new_hire_blocker') {
    return {
      type: 'milestone_blocked',
      title: `${params.hireName} needs support`,
      body: `${params.hireName} reported a blocker for ${params.milestoneTitle}.`,
    } as const;
  }

  if (params.verified) {
    return {
      type: 'milestone_auto_verified',
      title: `${params.hireName} verified for ${params.milestoneTitle}`,
      body: `Canon found strong proof that ${params.hireName} completed this real-work step.`,
    } as const;
  }

  return {
    type: 'milestone_needs_review',
    title: `${params.hireName} has proof to review`,
    body: `Canon found proof for ${params.milestoneTitle}, but a manager should review it before marking it done.`,
  } as const;
}

export async function recordMilestoneEvidence(params: RecordEvidenceParams) {
  const confidence = clampConfidence(params.confidence ?? confidenceForTrust(params.trustLevel));

  const { data: hire } = await params.supabase
    .from('new_hires')
    .select('id, first_name, last_name, organization_id')
    .eq('id', params.newHireId)
    .single();

  const { data: milestone } = await params.supabase
    .from('ramp_milestones')
    .select('id, title, organization_id')
    .eq('id', params.milestoneId)
    .single();

  if (!hire || !milestone) {
    log.warn('evidence_rejected', {
      newHireId: params.newHireId,
      milestoneId: params.milestoneId,
      evidenceType: params.evidenceType,
      reason: 'hire_or_milestone_not_found',
    });
    return { ok: false, error: 'New hire or milestone not found' };
  }

  if (milestone.organization_id !== hire.organization_id) {
    log.warn('evidence_rejected', {
      newHireId: params.newHireId,
      milestoneId: params.milestoneId,
      evidenceType: params.evidenceType,
      reason: 'organization_mismatch',
    });
    return { ok: false, error: 'Milestone does not belong to the new hire organization' };
  }

  const { data: existingProgress } = await params.supabase
    .from('new_hire_milestone_progress')
    .select('*')
    .eq('new_hire_id', params.newHireId)
    .eq('milestone_id', params.milestoneId)
    .maybeSingle();

  const resolvedStatus = progressStatusForEvidence({
    currentStatus: existingProgress?.status,
    evidenceType: params.evidenceType,
    trustLevel: params.trustLevel,
    confidence,
  });

  const progressPatch = {
    new_hire_id: params.newHireId,
    milestone_id: params.milestoneId,
    status: resolvedStatus,
    current_confidence: Math.max(existingProgress?.current_confidence ?? 0, confidence),
    last_evidence_at: new Date().toISOString(),
    verified_at: resolvedStatus === 'verified'
      ? existingProgress?.verified_at ?? new Date().toISOString()
      : existingProgress?.verified_at ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data: progress, error: progressError } = await params.supabase
    .from('new_hire_milestone_progress')
    .upsert(progressPatch, { onConflict: 'new_hire_id,milestone_id' })
    .select()
    .single();

  if (progressError || !progress) {
    log.error('progress_update_failed', {
      newHireId: params.newHireId,
      milestoneId: params.milestoneId,
      evidenceType: params.evidenceType,
      source: params.source,
      error: progressError?.message ?? 'missing_progress',
    });
    return { ok: false, error: progressError?.message ?? 'Failed to update learning step progress' };
  }

  let existingEvidence = null;
  if (params.sourceEventId) {
    const { data } = await params.supabase
      .from('milestone_evidence')
      .select('id')
      .eq('new_hire_id', params.newHireId)
      .eq('milestone_id', params.milestoneId)
      .eq('source', params.source)
      .eq('source_event_id', params.sourceEventId)
      .maybeSingle();
    existingEvidence = data;
  }

  const evidencePayload = {
    progress_id: progress.id,
    new_hire_id: params.newHireId,
    milestone_id: params.milestoneId,
    evidence_type: params.evidenceType,
    trust_level: params.trustLevel,
    confidence,
    source: params.source,
    source_event_id: params.sourceEventId ?? null,
    source_url: params.sourceUrl ?? null,
    metadata: params.metadata ?? {},
    created_by: params.createdBy ?? null,
  };

  const { data: evidence, error: evidenceError } = existingEvidence
    ? await params.supabase
        .from('milestone_evidence')
        .update(evidencePayload)
        .eq('id', existingEvidence.id)
        .select()
        .single()
    : await params.supabase
        .from('milestone_evidence')
        .insert(evidencePayload)
        .select()
        .single();

  if (evidenceError || !evidence) {
    log.error('evidence_write_failed', {
      newHireId: params.newHireId,
      milestoneId: params.milestoneId,
      evidenceType: params.evidenceType,
      source: params.source,
      sourceEventId: params.sourceEventId ?? null,
      error: evidenceError?.message ?? 'missing_evidence',
    });
    return { ok: false, error: evidenceError?.message ?? 'Failed to record milestone evidence' };
  }

  const copy = notificationCopy({
    hireName: `${hire.first_name} ${hire.last_name}`,
    milestoneTitle: milestone.title,
    evidenceType: params.evidenceType,
    verified: resolvedStatus === 'verified',
  });

  const metadata = params.metadata ?? {};
  const slackTarget = typeof metadata.notify_slack_target === 'string'
    ? metadata.notify_slack_target
    : typeof metadata.manager_slack_user_id === 'string'
      ? metadata.manager_slack_user_id
      : null;
  let slackBotToken: string | null = null;
  if (hire.organization_id) {
    const admin = createServiceRoleClient();
    slackBotToken = await getSlackBotTokenForOrganization({ supabase: admin, organizationId: hire.organization_id });
  }

  const slackSent = await maybeSendSlackNotification({
    botToken: slackBotToken,
    target: slackTarget,
    title: copy.title,
    body: copy.body,
  });

  const { error: notificationError } = await params.supabase.from('onboarding_notifications').insert({
    organization_id: hire.organization_id,
    new_hire_id: params.newHireId,
    milestone_id: params.milestoneId,
    type: copy.type,
    title: copy.title,
    body: copy.body,
    delivery_channel: 'app',
    slack_target: slackTarget,
    slack_sent_at: slackSent ? new Date().toISOString() : null,
  });

  if (notificationError) {
    log.warn('notification_write_failed', {
      organizationId: hire.organization_id,
      newHireId: params.newHireId,
      milestoneId: params.milestoneId,
      evidenceId: evidence.id,
      error: notificationError.message,
    });
  }

  log.info('evidence_recorded', {
    organizationId: hire.organization_id,
    newHireId: params.newHireId,
    milestoneId: params.milestoneId,
    evidenceId: evidence.id,
    evidenceType: params.evidenceType,
    trustLevel: params.trustLevel,
    confidence,
    status: resolvedStatus,
    source: params.source,
    verified: resolvedStatus === 'verified',
    notificationSlackSent: slackSent,
  });

  return { ok: true, progress, evidence, verified: resolvedStatus === 'verified' };
}

export async function syncAccessReadinessEvidence(params: {
  supabase: DbClient;
  newHireId: string;
  createdBy?: string | null;
}) {
  const { data: hire } = await params.supabase
    .from('new_hires')
    .select('id, role, organization_id')
    .eq('id', params.newHireId)
    .single();

  if (!hire) return { checked: 0, verified: 0 };

  const [{ data: milestones }, { data: accessRequests }] = await Promise.all([
    params.supabase
      .from('ramp_milestones')
      .select('*')
      .eq('organization_id', hire.organization_id)
      .eq('role', hire.role)
      .eq('status', 'active'),
    params.supabase
      .from('access_requests')
      .select('id, tool_name, status')
      .eq('new_hire_id', params.newHireId),
  ]);

  const grantedTools = new Set(
    (accessRequests ?? [])
      .filter((request) => isAccessStatusGranted(request.status))
      .map((request) => normalizeToolName(String(request.tool_name)))
  );
  const confirmedTools = new Set(
    (accessRequests ?? [])
      .filter((request) => isAccessStatusConfirmed(request.status))
      .map((request) => normalizeToolName(String(request.tool_name)))
  );

  let checked = 0;
  let verified = 0;

  for (const milestone of milestones ?? []) {
    const requirements = (milestone.evidence_requirements ?? []) as MilestoneEvidenceRequirement[];
    const tools = requiredToolsForEvidence(requirements);
    if (tools.length === 0) continue;
    checked++;

    const allGranted = tools.every((tool) => grantedTools.has(normalizeToolName(tool)));
    if (!allGranted) continue;
    const allConfirmed = tools.every((tool) => confirmedTools.has(normalizeToolName(tool)));

    const result = await recordMilestoneEvidence({
      supabase: params.supabase,
      newHireId: params.newHireId,
      milestoneId: milestone.id,
      evidenceType: 'access_readiness',
      trustLevel: 'high',
      confidence: allConfirmed ? 0.98 : 0.88,
      source: 'access_requests',
      sourceEventId: `access-ready:${params.newHireId}:${milestone.id}:${tools.sort().join(',')}`,
      metadata: { tools, confirmed: allConfirmed },
      createdBy: params.createdBy ?? null,
    });

    if (result.verified) verified++;
  }

  return { checked, verified };
}
