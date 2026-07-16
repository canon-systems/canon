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
  type CanonicalMilestoneProgressStatus,
  isAccessStatusConfirmed,
  isAccessStatusGranted,
  normalizeMilestoneProgressStatus,
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
    progress_rollback_failed: 'Progress Rollback Failed',
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
  progressStatusOverride?: CanonicalMilestoneProgressStatus;
  requiredCurrentStatus?: CanonicalMilestoneProgressStatus;
  allowVerifiedStatusChange?: boolean;
  clearVerifiedAt?: boolean;
  suppressNotification?: boolean;
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
  targets: string[];
  title: string;
  body: string;
  blocks?: unknown[];
}) {
  if (!params.botToken || params.targets.length === 0) return false;

  const results = await Promise.all(params.targets.map((target) => postSlackMessage({
    botToken: params.botToken!,
    channel: target,
    text: `*${params.title}*\n${params.body}`,
    blocks: params.blocks,
  })));

  return results.some((result) => result.ok);
}

function uniqueSlackTargets(metadata: Record<string, unknown>) {
  const targets = new Set<string>();
  const singleTarget = typeof metadata.notify_slack_target === 'string'
    ? metadata.notify_slack_target
    : typeof metadata.manager_slack_user_id === 'string'
      ? metadata.manager_slack_user_id
      : null;
  if (singleTarget?.trim()) targets.add(singleTarget.trim());

  if (Array.isArray(metadata.notify_slack_targets)) {
    for (const target of metadata.notify_slack_targets) {
      if (typeof target === 'string' && target.trim()) targets.add(target.trim());
    }
  }

  return Array.from(targets);
}

function compactSlackText(value: unknown, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const compacted = value.replace(/\s+/g, ' ').trim();
  return compacted.length <= 500 ? compacted : `${compacted.slice(0, 497).trimEnd()}...`;
}

export function managerReviewBlocks(params: {
  title: string;
  body: string;
  newHireId: string;
  milestoneId: string;
  evidenceId: string;
  evidenceType: MilestoneEvidenceType;
  verified: boolean;
  metadata: Record<string, unknown>;
}) {
  const blocks: unknown[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${params.title}*\n${params.body}`,
      },
    },
  ];

  const reason = compactSlackText(params.metadata.reason);
  const excerpt = compactSlackText(params.metadata.excerpt);
  if (reason) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Why Canon flagged this:*\n${reason}` },
    });
  }
  if (excerpt) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `*Proof:* _${excerpt}_` }],
    });
  }

  if (!params.verified && params.evidenceType !== 'new_hire_blocker') {
    const value = `${params.newHireId}|${params.milestoneId}|${params.evidenceId}`;
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Verify', emoji: true },
          style: 'primary',
          action_id: 'manager_milestone_verify',
          value,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Keep open', emoji: true },
          action_id: 'manager_milestone_keep_open',
          value,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Mark blocked', emoji: true },
          style: 'danger',
          action_id: 'manager_milestone_mark_blocked',
          value,
        },
      ],
    });
  }

  return blocks;
}

export function managerReviewResultBlocks(params: {
  statusText: string;
  actor: string;
  reopenValue?: string;
}) {
  const blocks: unknown[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${params.statusText}\nReviewed by *${params.actor}*.`,
      },
    },
  ];

  if (params.reopenValue) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Reopen step', emoji: true },
          action_id: 'manager_milestone_unverify',
          value: params.reopenValue,
        },
      ],
    });
  }

  return blocks;
}

function notificationSourceLabel(source: string) {
  if (source === 'slack') return 'Slack';
  if (source === 'granola') return 'meeting notes';
  if (source === 'access_requests') return 'tool access';
  return 'connected work activity';
}

export function notificationCopy(params: {
  hireName: string;
  milestoneTitle: string;
  evidenceType: MilestoneEvidenceType;
  verified: boolean;
  source: string;
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
      title: `${params.hireName} completed "${params.milestoneTitle}"`,
      body: `Canon found clear proof in ${notificationSourceLabel(params.source)} and marked this learning step complete.`,
    } as const;
  }

  return {
    type: 'milestone_needs_review',
    title: `${params.hireName} may have completed "${params.milestoneTitle}"`,
    body: `Canon found possible proof in ${notificationSourceLabel(params.source)}. Please review it before this learning step is marked complete.`,
  } as const;
}

export function shouldNotifyForMilestoneEvidence(params: {
  suppressNotification?: boolean;
  evidenceExists: boolean;
  currentStatus: CanonicalMilestoneProgressStatus;
  resolvedStatus: CanonicalMilestoneProgressStatus;
}) {
  return !params.suppressNotification && (
    !params.evidenceExists || params.currentStatus !== params.resolvedStatus
  );
}

export function resolveMilestoneEvidenceProgressStatus(params: {
  currentStatus: CanonicalMilestoneProgressStatus;
  evidenceType: MilestoneEvidenceType;
  trustLevel: MilestoneEvidenceTrustLevel;
  confidence: number;
  progressStatusOverride?: CanonicalMilestoneProgressStatus;
  allowVerifiedStatusChange?: boolean;
}) {
  if (params.currentStatus === 'verified' && !params.allowVerifiedStatusChange) return 'verified';
  return params.progressStatusOverride ?? progressStatusForEvidence({
    currentStatus: params.currentStatus,
    evidenceType: params.evidenceType,
    trustLevel: params.trustLevel,
    confidence: params.confidence,
  });
}

export function resolveMilestoneVerifiedAt(params: {
  resolvedStatus: CanonicalMilestoneProgressStatus;
  currentVerifiedAt: string | null | undefined;
  clearVerifiedAt?: boolean;
  now: string;
}) {
  if (params.clearVerifiedAt) return null;
  if (params.resolvedStatus === 'verified') return params.currentVerifiedAt ?? params.now;
  return params.currentVerifiedAt ?? null;
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

  const currentStatus = normalizeMilestoneProgressStatus(existingProgress?.status);
  if (params.requiredCurrentStatus && currentStatus !== params.requiredCurrentStatus) {
    return { ok: false, error: 'Only verified learning steps can be reopened' };
  }
  const resolvedStatus = resolveMilestoneEvidenceProgressStatus({
    currentStatus,
    evidenceType: params.evidenceType,
    trustLevel: params.trustLevel,
    confidence,
    progressStatusOverride: params.progressStatusOverride,
    allowVerifiedStatusChange: params.allowVerifiedStatusChange,
  });
  const now = new Date().toISOString();

  const progressPatch = {
    new_hire_id: params.newHireId,
    milestone_id: params.milestoneId,
    status: resolvedStatus,
    current_confidence: Math.max(existingProgress?.current_confidence ?? 0, confidence),
    last_evidence_at: now,
    verified_at: resolveMilestoneVerifiedAt({
      resolvedStatus,
      currentVerifiedAt: existingProgress?.verified_at,
      clearVerifiedAt: params.clearVerifiedAt,
      now,
    }),
    updated_at: now,
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

    const rollbackResult = existingProgress
      ? await params.supabase
          .from('new_hire_milestone_progress')
          .update({
            status: existingProgress.status,
            current_confidence: existingProgress.current_confidence,
            last_evidence_at: existingProgress.last_evidence_at,
            verified_at: existingProgress.verified_at,
            updated_at: existingProgress.updated_at,
          })
          .eq('id', progress.id)
          .eq('updated_at', progress.updated_at)
          .select('id')
          .maybeSingle()
      : await params.supabase
          .from('new_hire_milestone_progress')
          .delete()
          .eq('id', progress.id)
          .eq('updated_at', progress.updated_at)
          .select('id')
          .maybeSingle();

    if (rollbackResult.error || !rollbackResult.data) {
      log.error('progress_rollback_failed', {
        newHireId: params.newHireId,
        milestoneId: params.milestoneId,
        evidenceType: params.evidenceType,
        progressId: progress.id,
        error: rollbackResult.error?.message ?? 'progress_changed_before_rollback',
      });
    }

    return { ok: false, error: evidenceError?.message ?? 'Failed to record milestone evidence' };
  }

  const copy = notificationCopy({
    hireName: `${hire.first_name} ${hire.last_name}`,
    milestoneTitle: milestone.title,
    evidenceType: params.evidenceType,
    verified: resolvedStatus === 'verified',
    source: params.source,
  });

  const metadata = params.metadata ?? {};
  const slackTargets = uniqueSlackTargets(metadata);
  const shouldNotify = shouldNotifyForMilestoneEvidence({
    suppressNotification: params.suppressNotification,
    evidenceExists: Boolean(existingEvidence),
    currentStatus,
    resolvedStatus,
  });
  let slackBotToken: string | null = null;
  if (shouldNotify && slackTargets.length > 0 && hire.organization_id) {
    const admin = createServiceRoleClient();
    slackBotToken = await getSlackBotTokenForOrganization({ supabase: admin, organizationId: hire.organization_id });
  }

  const slackSent = shouldNotify
    ? await maybeSendSlackNotification({
        botToken: slackBotToken,
        targets: slackTargets,
        title: copy.title,
        body: copy.body,
        blocks: managerReviewBlocks({
          title: copy.title,
          body: copy.body,
          newHireId: params.newHireId,
          milestoneId: params.milestoneId,
          evidenceId: evidence.id,
          evidenceType: params.evidenceType,
          verified: resolvedStatus === 'verified',
          metadata,
        }),
      })
    : false;

  const { error: notificationError } = shouldNotify
    ? await params.supabase.from('onboarding_notifications').insert({
        organization_id: hire.organization_id,
        new_hire_id: params.newHireId,
        milestone_id: params.milestoneId,
        type: copy.type,
        title: copy.title,
        body: copy.body,
        delivery_channel: 'app',
        slack_target: slackTargets[0] ?? null,
        slack_sent_at: slackSent ? new Date().toISOString() : null,
      })
    : { error: null };

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

export type ManagerMilestoneDecision = 'verify' | 'keep_open' | 'mark_blocked' | 'unverify';

export function managerMilestoneDecisionConfig(decision: ManagerMilestoneDecision): {
  evidenceType: MilestoneEvidenceType;
  trustLevel: MilestoneEvidenceTrustLevel;
  confidence: number;
  progressStatusOverride: CanonicalMilestoneProgressStatus;
  requiredCurrentStatus?: CanonicalMilestoneProgressStatus;
  allowVerifiedStatusChange?: boolean;
  clearVerifiedAt?: boolean;
  statusText: string;
} {
  if (decision === 'verify') {
    return {
      evidenceType: 'manager_verification' as const,
      trustLevel: 'high' as const,
      confidence: 0.95,
      progressStatusOverride: 'verified' as const,
      statusText: '*Learning step verified.*',
    };
  }

  if (decision === 'mark_blocked') {
    return {
      evidenceType: 'new_hire_blocker' as const,
      trustLevel: 'low' as const,
      confidence: 0.2,
      progressStatusOverride: 'blocked' as const,
      statusText: '*Learning step marked blocked.*',
    };
  }

  if (decision === 'unverify') {
    return {
      evidenceType: 'manager_reopened' as const,
      trustLevel: 'high' as const,
      confidence: 0.95,
      progressStatusOverride: 'briefed' as const,
      requiredCurrentStatus: 'verified' as const,
      allowVerifiedStatusChange: true,
      clearVerifiedAt: true,
      statusText: '*Learning step reopened.*',
    };
  }

  return {
    evidenceType: 'communication_activity' as const,
    trustLevel: 'low' as const,
    confidence: 0.3,
    progressStatusOverride: 'briefed' as const,
    statusText: '*Learning step kept open.*',
  };
}

export async function recordManagerMilestoneDecision(params: {
  supabase: DbClient;
  newHireId: string;
  milestoneId: string;
  decision: ManagerMilestoneDecision;
  source: 'manager_review' | 'manager_slack_review';
  sourceEventId: string;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
}) {
  const config = managerMilestoneDecisionConfig(params.decision);
  return recordMilestoneEvidence({
    supabase: params.supabase,
    newHireId: params.newHireId,
    milestoneId: params.milestoneId,
    evidenceType: config.evidenceType,
    trustLevel: config.trustLevel,
    confidence: config.confidence,
    progressStatusOverride: config.progressStatusOverride,
    requiredCurrentStatus: config.requiredCurrentStatus,
    allowVerifiedStatusChange: config.allowVerifiedStatusChange,
    clearVerifiedAt: config.clearVerifiedAt,
    source: params.source,
    sourceEventId: params.sourceEventId,
    metadata: params.metadata,
    createdBy: params.createdBy,
    suppressNotification: true,
  });
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
