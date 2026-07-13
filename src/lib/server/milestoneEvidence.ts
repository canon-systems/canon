import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  MilestoneEvidenceTrustLevel,
  MilestoneEvidenceType,
  MilestoneEvidenceRequirement,
} from '@/types/onboarding';
import { createLogger } from '@/lib/server/logging';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getProviderAccessToken } from '@/lib/server/oauth/tokenStore';

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

function nextStatus(params: {
  currentStatus?: string | null;
  evidenceType: MilestoneEvidenceType;
  trustLevel: MilestoneEvidenceTrustLevel;
  confidence: number;
}) {
  if (params.currentStatus === 'verified') return 'verified';
  if (params.evidenceType === 'new_hire_blocker') return 'evidence_detected';
  if (params.trustLevel === 'high' && params.confidence >= 0.8) return 'verified';
  return 'evidence_detected';
}

async function maybeSendSlackNotification(params: {
  botToken: string | null;
  target: string | null;
  title: string;
  body: string;
}) {
  if (!params.botToken || !params.target) return false;

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.botToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      channel: params.target,
      text: `*${params.title}*\n${params.body}`,
      unfurl_links: false,
      unfurl_media: false,
    }),
  });

  const data = (await res.json().catch(() => null)) as { ok?: boolean } | null;
  return Boolean(data?.ok);
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
      title: `${params.hireName} needs milestone support`,
      body: `${params.hireName} reported a blocker for ${params.milestoneTitle}.`,
    } as const;
  }

  if (params.verified) {
    return {
      type: 'milestone_auto_verified',
      title: `${params.hireName} verified for ${params.milestoneTitle}`,
      body: `Canon found high-confidence evidence that ${params.hireName} completed the real-work signal for this milestone.`,
    } as const;
  }

  return {
    type: 'milestone_needs_review',
    title: `${params.hireName} has evidence to review`,
    body: `Canon found evidence for ${params.milestoneTitle}, but it needs manager review before verification.`,
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

  const resolvedStatus = nextStatus({
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
    return { ok: false, error: progressError?.message ?? 'Failed to update milestone progress' };
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
    const { data: slackConn } = await admin
      .from('oauth_connections')
      .select('connection_id')
      .eq('organization_id', hire.organization_id)
      .eq('provider', 'slack')
      .eq('status', 'active')
      .maybeSingle();
    if (slackConn) {
      slackBotToken = await getProviderAccessToken({ provider: 'slack', connectionId: slackConn.connection_id });
    }
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

function metadataStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : [];
}

function requiredTools(requirements: MilestoneEvidenceRequirement[]) {
  const tools = new Set<string>();
  for (const requirement of requirements) {
    if (requirement.type !== 'access_readiness') continue;
    const metadata = requirement.metadata ?? {};
    for (const tool of metadataStringArray(metadata.tools)) tools.add(tool);
    if (typeof metadata.tool === 'string' && metadata.tool.trim()) tools.add(metadata.tool.trim());
  }
  return Array.from(tools);
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
      .filter((request) => request.status === 'granted')
      .map((request) => String(request.tool_name).toLowerCase())
  );

  let checked = 0;
  let verified = 0;

  for (const milestone of milestones ?? []) {
    const requirements = (milestone.evidence_requirements ?? []) as MilestoneEvidenceRequirement[];
    const tools = requiredTools(requirements);
    if (tools.length === 0) continue;
    checked++;

    const allGranted = tools.every((tool) => grantedTools.has(tool.toLowerCase()));
    if (!allGranted) continue;

    const result = await recordMilestoneEvidence({
      supabase: params.supabase,
      newHireId: params.newHireId,
      milestoneId: milestone.id,
      evidenceType: 'access_readiness',
      trustLevel: 'high',
      confidence: 0.92,
      source: 'access_requests',
      sourceEventId: `access-ready:${params.newHireId}:${milestone.id}:${tools.sort().join(',')}`,
      metadata: { tools },
      createdBy: params.createdBy ?? null,
    });

    if (result.verified) verified++;
  }

  return { checked, verified };
}
