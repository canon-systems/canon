import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { inngest } from '@/inngest/client';
import { INNGEST_EVENTS } from '@/inngest/constants';
import { createLogger } from '@/lib/server/logging';
import { normalizeRoleName } from '@/lib/onboarding/roles';
import {
  hasMilestoneContentOverlap,
  type MilestoneContentLike,
  normalizeMilestoneContentKey,
  normalizeRampTargets,
} from '@/lib/onboarding/milestone-ramp';
import { requireWorkspace, requireWorkspaceAdmin } from '@/lib/server/organization';
import type { HireRole, MilestoneEvidenceRequirement } from '@/types/onboarding';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const log = createLogger('api.onboarding.milestones', {
  label: 'Milestones API',
  eventLabels: {
    milestones_loaded: 'Milestones Loaded',
    generation_requested: 'Generation Requested',
    proposal_approved: 'Proposal Approved',
    proposal_rejected: 'Proposal Rejected',
    proposal_updated: 'Proposal Updated',
    milestone_created: 'Milestone Created',
    milestone_updated: 'Milestone Updated',
    milestone_archived: 'Milestone Archived',
  },
});

function isRole(value: unknown): value is HireRole {
  return typeof value === 'string' && normalizeRoleName(value).length >= 2 && normalizeRoleName(value).length <= 120;
}

function stringField(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function evidenceRequirements(value: unknown): MilestoneEvidenceRequirement[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): MilestoneEvidenceRequirement[] => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as Record<string, unknown>;
    const type = stringField(item.type);
    const label = stringField(item.label);
    if (!['access_readiness', 'tool_activity', 'communication_activity', 'customer_exposure'].includes(type) || !label) {
      return [];
    }
    const metadata = item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
      ? item.metadata as Record<string, unknown>
      : undefined;
    return [{
      type: type as MilestoneEvidenceRequirement['type'],
      label,
      required: typeof item.required === 'boolean' ? item.required : true,
      trust_level: item.trust_level === 'high' ? 'high' : 'medium',
      metadata,
    }];
  });
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : [];
}

function eventIds(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;
  const ids = (value as { ids?: unknown }).ids;
  return Array.isArray(ids) ? ids.filter((entry): entry is string => typeof entry === 'string') : undefined;
}

function isMissingMilestoneGenerationRuns(error: unknown) {
  return !!error && typeof error === 'object' && (
    (error as { code?: string }).code === 'PGRST205' ||
    String((error as { message?: string }).message ?? '').includes('milestone_generation_runs')
  );
}

async function isActiveRole(
  supabase: SupabaseClient,
  organizationId: string,
  role: string
) {
  const { data } = await supabase
    .from('role_profiles')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('role', role)
    .eq('status', 'active')
    .maybeSingle();

  return Boolean(data);
}

async function roleTargetRampDays(
  supabase: SupabaseClient,
  organizationId: string,
  role: string
) {
  const { data } = await supabase
    .from('role_profiles')
    .select('baseline_ramp_days, target_ramp_days')
    .eq('organization_id', organizationId)
    .eq('role', role)
    .eq('status', 'active')
    .maybeSingle();

  return normalizeRampTargets({
    baselineRampDays: typeof data?.baseline_ramp_days === 'number' ? data.baseline_ramp_days : null,
    targetRampDays: typeof data?.target_ramp_days === 'number' ? data.target_ramp_days : null,
  }).targetRampDays;
}

async function activeRoleCount(
  supabase: SupabaseClient,
  organizationId: string
) {
  const { count, error } = await supabase
    .from('role_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('status', 'active');

  if (error) throw error;
  return count ?? 0;
}

async function hasActiveMilestoneOnDay(params: {
  supabase: SupabaseClient;
  organizationId: string;
  role: string;
  dayTrigger: number;
  excludeMilestoneId?: string;
}) {
  let query = params.supabase
    .from('ramp_milestones')
    .select('id')
    .eq('organization_id', params.organizationId)
    .eq('role', params.role)
    .eq('day_trigger', params.dayTrigger)
    .eq('status', 'active')
    .limit(1);

  if (params.excludeMilestoneId) query = query.neq('id', params.excludeMilestoneId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).length > 0;
}

async function hasDraftProposalOnDay(params: {
  supabase: SupabaseClient;
  organizationId: string;
  role: string;
  dayTrigger: number;
  excludeProposalId?: string;
}) {
  let query = params.supabase
    .from('milestone_proposals')
    .select('id')
    .eq('organization_id', params.organizationId)
    .eq('role', params.role)
    .eq('suggested_day_trigger', params.dayTrigger)
    .eq('status', 'draft')
    .limit(1);

  if (params.excludeProposalId) query = query.neq('id', params.excludeProposalId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).length > 0;
}

async function hasMilestoneContentConflict(params: {
  supabase: SupabaseClient;
  organizationId: string;
  role: string;
  candidate: MilestoneContentLike;
  excludeMilestoneId?: string;
  excludeProposalId?: string;
}) {
  let milestoneQuery = params.supabase
    .from('ramp_milestones')
    .select('id, title, capability_outcome, briefing_goal, real_work_trigger, success_signals, retrieval_brief, evidence_requirements')
    .eq('organization_id', params.organizationId)
    .eq('role', params.role)
    .eq('status', 'active')
    .limit(500);

  if (params.excludeMilestoneId) milestoneQuery = milestoneQuery.neq('id', params.excludeMilestoneId);

  let proposalQuery = params.supabase
    .from('milestone_proposals')
    .select('id, title, capability_outcome, briefing_goal, real_work_trigger, success_signals, retrieval_brief, evidence_requirements')
    .eq('organization_id', params.organizationId)
    .eq('role', params.role)
    .eq('status', 'draft')
    .limit(500);

  if (params.excludeProposalId) proposalQuery = proposalQuery.neq('id', params.excludeProposalId);

  const [{ data: milestones, error: milestoneError }, { data: proposals, error: proposalError }] = await Promise.all([
    milestoneQuery,
    proposalQuery,
  ]);
  if (milestoneError) throw milestoneError;
  if (proposalError) throw proposalError;

  return hasMilestoneContentOverlap(params.candidate, [
    ...((milestones ?? []) as MilestoneContentLike[]),
    ...((proposals ?? []) as MilestoneContentLike[]),
  ]);
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { supabase, organization } = await requireWorkspace(user);

    const roleParam = normalizeRoleName(request.nextUrl.searchParams.get('role') ?? '');
    if (roleParam && !isRole(roleParam)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });

    let milestoneQuery = supabase
      .from('ramp_milestones')
      .select('*')
      .eq('organization_id', organization.id)
      .eq('status', 'active')
      .order('day_trigger', { ascending: true });

    if (roleParam) {
      milestoneQuery = milestoneQuery.eq('role', roleParam);
    }

    const { data: milestones, error: milestoneError } = await milestoneQuery;
    if (milestoneError) throw milestoneError;

    let proposalQuery = supabase
      .from('milestone_proposals')
      .select('*')
      .eq('organization_id', organization.id)
      .eq('status', 'draft')
      .order('suggested_day_trigger', { ascending: true });

    if (roleParam) {
      proposalQuery = proposalQuery.eq('role', roleParam);
    }

    const [{ data: proposals, error: proposalError }, { data: latestGeneration, error: generationError }] = await Promise.all([
      proposalQuery,
      supabase
        .from('milestone_generation_runs')
        .select('*')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (proposalError) throw proposalError;
    if (generationError && !isMissingMilestoneGenerationRuns(generationError)) throw generationError;

    log.debug('milestones_loaded', {
      userId: user.id,
      organizationId: organization.id,
      role: roleParam ?? 'all',
      milestoneCount: milestones?.length ?? 0,
      proposalCount: proposals?.length ?? 0,
    });

    return NextResponse.json({
      milestones: milestones ?? [],
      proposals: proposals ?? [],
      latest_generation: latestGeneration ?? null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/milestones] GET failed', error);
    return NextResponse.json({ error: 'Failed to load milestones', detail: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { supabase, organization } = await requireWorkspaceAdmin(user);

    const body = (await request.json()) as {
      action?: string;
      proposal_id?: string;
      proposal_ids?: unknown;
      role?: string;
      day_trigger?: number;
      title?: string;
      description?: string;
      knowledge_query?: string;
      capability_outcome?: string;
      briefing_goal?: string;
      real_work_trigger?: string;
      success_signals?: unknown;
      retrieval_brief?: string;
      evidence_requirements?: unknown;
    };

    if (body.action === 'generate') {
      if ((await activeRoleCount(supabase, organization.id)) === 0) {
        return NextResponse.json({
          error: 'Add at least one active role before generating learning steps.',
        }, { status: 409 });
      }

      const { data: generationRun, error: generationRunError } = await supabase
        .from('milestone_generation_runs')
        .insert({
          organization_id: organization.id,
          requested_by: user.id,
          status: 'queued',
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (generationRunError && isMissingMilestoneGenerationRuns(generationRunError)) {
        const result = await inngest.send({
          name: INNGEST_EVENTS.MILESTONE_PROPOSALS_REQUESTED,
          data: { organizationId: organization.id, requestedBy: user.id },
        });
        log.info('generation_requested', {
          userId: user.id,
          organizationId: organization.id,
          eventName: INNGEST_EVENTS.MILESTONE_PROPOSALS_REQUESTED,
          eventIds: eventIds(result),
          statusTracking: 'unavailable',
        });
        return NextResponse.json({ ok: true, requested: true, generation: null });
      }

      if (generationRunError || !generationRun) {
        throw generationRunError ?? new Error('Milestone generation run insert failed');
      }

      const result = await inngest.send({
        name: INNGEST_EVENTS.MILESTONE_PROPOSALS_REQUESTED,
        data: { organizationId: organization.id, requestedBy: user.id, generationRunId: generationRun.id },
      });
      log.info('generation_requested', {
        userId: user.id,
        organizationId: organization.id,
        generationRunId: generationRun.id,
        eventName: INNGEST_EVENTS.MILESTONE_PROPOSALS_REQUESTED,
        eventIds: eventIds(result),
      });
      return NextResponse.json({ ok: true, requested: true, generation: generationRun });
    }

    if (body.action === 'update_proposal') {
      if (!body.proposal_id) return NextResponse.json({ error: 'proposal_id is required' }, { status: 400 });
      const { data: currentProposal, error: currentProposalError } = await supabase
        .from('milestone_proposals')
        .select('id, role, suggested_day_trigger, title, capability_outcome, briefing_goal, real_work_trigger, success_signals, retrieval_brief, evidence_requirements')
        .eq('id', body.proposal_id)
        .eq('organization_id', organization.id)
        .eq('status', 'draft')
        .single();
      if (currentProposalError || !currentProposal) return NextResponse.json({ error: 'Proposal not found or already resolved' }, { status: 404 });

      const nextDayTrigger = typeof body.day_trigger === 'number'
        ? body.day_trigger
        : currentProposal.suggested_day_trigger;
      if (typeof nextDayTrigger === 'number') {
        const [activeConflict, draftConflict] = await Promise.all([
          hasActiveMilestoneOnDay({
            supabase,
            organizationId: organization.id,
            role: currentProposal.role,
            dayTrigger: nextDayTrigger,
          }),
          hasDraftProposalOnDay({
            supabase,
            organizationId: organization.id,
            role: currentProposal.role,
            dayTrigger: nextDayTrigger,
            excludeProposalId: currentProposal.id,
          }),
        ]);
        if (activeConflict || draftConflict) {
          return NextResponse.json({ error: `Day ${nextDayTrigger} already has a learning step for this role` }, { status: 409 });
        }
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof body.day_trigger === 'number') updates.suggested_day_trigger = body.day_trigger;
      const updTitle = stringField(body.title);
      if (updTitle) updates.title = updTitle;
      const updCapability = stringField(body.capability_outcome);
      if (updCapability) updates.capability_outcome = updCapability;
      const updBriefing = stringField(body.briefing_goal);
      if (updBriefing) updates.briefing_goal = updBriefing;
      const updRealWork = stringField(body.real_work_trigger);
      if (updRealWork) updates.real_work_trigger = updRealWork;
      const updRetrieval = stringField(body.retrieval_brief);
      if (updRetrieval) updates.retrieval_brief = updRetrieval;
      if (Array.isArray(body.success_signals)) updates.success_signals = stringArray(body.success_signals);

      const nextCandidate = {
        title: updTitle || currentProposal.title,
        capability_outcome: updCapability || currentProposal.capability_outcome,
        briefing_goal: updBriefing || currentProposal.briefing_goal,
        real_work_trigger: updRealWork || currentProposal.real_work_trigger,
        success_signals: Array.isArray(body.success_signals) ? stringArray(body.success_signals) : currentProposal.success_signals,
        retrieval_brief: updRetrieval || currentProposal.retrieval_brief,
        evidence_requirements: currentProposal.evidence_requirements,
      };
      if (await hasMilestoneContentConflict({
        supabase,
        organizationId: organization.id,
        role: currentProposal.role,
        candidate: nextCandidate,
        excludeProposalId: currentProposal.id,
      })) {
        return NextResponse.json({ error: 'This learning step overlaps with an existing milestone or draft for this role' }, { status: 409 });
      }
      updates.normalized_key = normalizeMilestoneContentKey(`${nextCandidate.title}-${nextCandidate.real_work_trigger}`);

      const { data: proposal, error } = await supabase
        .from('milestone_proposals')
        .update(updates)
        .eq('id', body.proposal_id)
        .eq('organization_id', organization.id)
        .eq('status', 'draft')
        .select()
        .single();
      if (error || !proposal) return NextResponse.json({ error: 'Proposal not found or already resolved' }, { status: 404 });
      log.debug('proposal_updated', { userId: user.id, organizationId: organization.id, proposalId: proposal.id });
      return NextResponse.json({ proposal });
    }

    if (body.action === 'reject_proposals') {
      const proposalIds = Array.from(new Set(stringArray(body.proposal_ids))).slice(0, 100);
      if (proposalIds.length === 0) return NextResponse.json({ error: 'proposal_ids is required' }, { status: 400 });

      const now = new Date().toISOString();
      const { data: proposals, error } = await supabase
        .from('milestone_proposals')
        .update({ status: 'rejected', rejected_at: now, updated_at: now })
        .eq('organization_id', organization.id)
        .eq('status', 'draft')
        .in('id', proposalIds)
        .select();
      if (error) throw error;
      return NextResponse.json({ proposals: proposals ?? [], rejected: proposals?.length ?? 0 });
    }

    if (body.action === 'approve_proposals') {
      const proposalIds = Array.from(new Set(stringArray(body.proposal_ids))).slice(0, 100);
      if (proposalIds.length === 0) return NextResponse.json({ error: 'proposal_ids is required' }, { status: 400 });

      const { data: proposals, error: proposalsError } = await supabase
        .from('milestone_proposals')
        .select('*')
        .eq('organization_id', organization.id)
        .eq('status', 'draft')
        .in('id', proposalIds);
      if (proposalsError) throw proposalsError;

      const checks = await Promise.all((proposals ?? []).map(async (proposal) => {
        const dayTrigger = proposal.suggested_day_trigger;
        const [activeRole, targetRampDays, activeDayConflict, draftDayConflict, contentConflict] = await Promise.all([
          isActiveRole(supabase, organization.id, proposal.role),
          roleTargetRampDays(supabase, organization.id, proposal.role),
          hasActiveMilestoneOnDay({
            supabase,
            organizationId: organization.id,
            role: proposal.role,
            dayTrigger,
          }),
          hasDraftProposalOnDay({
            supabase,
            organizationId: organization.id,
            role: proposal.role,
            dayTrigger,
            excludeProposalId: proposal.id,
          }),
          hasMilestoneContentConflict({
            supabase,
            organizationId: organization.id,
            role: proposal.role,
            candidate: proposal,
            excludeProposalId: proposal.id,
          }),
        ]);

        const reason = !activeRole
          ? 'Role is not active'
          : !Number.isInteger(dayTrigger) || dayTrigger < 0 || dayTrigger > targetRampDays
            ? `Day must be between 0 and ${targetRampDays}`
            : activeDayConflict || draftDayConflict
              ? `Day ${dayTrigger} already has a learning step`
              : contentConflict
                ? 'Overlaps with another learning step'
                : null;
        return { proposal, reason };
      }));

      const approvedCandidates = checks.filter((check) => !check.reason);
      const now = new Date().toISOString();
      const { data: milestones, error: milestoneError } = approvedCandidates.length > 0
        ? await supabase
            .from('ramp_milestones')
            .insert(approvedCandidates.map(({ proposal }) => ({
              organization_id: organization.id,
              role: proposal.role,
              day_trigger: proposal.suggested_day_trigger,
              title: proposal.title,
              description: proposal.capability_outcome,
              knowledge_query: proposal.retrieval_brief,
              capability_outcome: proposal.capability_outcome,
              briefing_goal: proposal.briefing_goal,
              real_work_trigger: proposal.real_work_trigger,
              success_signals: proposal.success_signals,
              retrieval_brief: proposal.retrieval_brief,
              evidence_requirements: proposal.evidence_requirements,
              source_evidence: proposal.source_evidence,
              confidence: proposal.confidence,
              status: 'active',
              approved_from_proposal_id: proposal.id,
              updated_at: now,
            })))
            .select()
        : { data: [], error: null };
      if (milestoneError) throw milestoneError;

      const milestoneByProposal = new Map((milestones ?? []).map((milestone) => [milestone.approved_from_proposal_id, milestone]));
      await Promise.all(approvedCandidates.map(async ({ proposal }) => {
        const milestone = milestoneByProposal.get(proposal.id);
        if (!milestone) return;
        const { error } = await supabase
          .from('milestone_proposals')
          .update({
            status: 'approved',
            approved_milestone_id: milestone.id,
            approved_at: now,
            updated_at: now,
          })
          .eq('id', proposal.id)
          .eq('organization_id', organization.id)
          .eq('status', 'draft');
        if (error) throw error;
      }));

      return NextResponse.json({
        milestones: milestones ?? [],
        approved: milestones?.length ?? 0,
        skipped: checks.filter((check) => check.reason).map((check) => ({ id: check.proposal.id, reason: check.reason })),
      }, { status: 201 });
    }

    if (body.action === 'reject_proposal') {
      if (!body.proposal_id) return NextResponse.json({ error: 'proposal_id is required' }, { status: 400 });
      const { data: proposal, error } = await supabase
        .from('milestone_proposals')
        .update({ status: 'rejected', rejected_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', body.proposal_id)
        .eq('organization_id', organization.id)
        .eq('status', 'draft')
        .select()
        .single();
      if (error || !proposal) return NextResponse.json({ error: 'Proposal not found or already resolved' }, { status: 404 });
      log.info('proposal_rejected', {
        userId: user.id,
        organizationId: organization.id,
        proposalId: proposal.id,
        role: proposal.role,
      });
      return NextResponse.json({ proposal });
    }

    if (body.action === 'approve_proposal') {
      if (!body.proposal_id) return NextResponse.json({ error: 'proposal_id is required' }, { status: 400 });

      const { data: proposal, error: proposalError } = await supabase
        .from('milestone_proposals')
        .select('*')
        .eq('id', body.proposal_id)
        .eq('organization_id', organization.id)
        .eq('status', 'draft')
        .single();

      if (proposalError || !proposal) return NextResponse.json({ error: 'Proposal not found or already resolved' }, { status: 404 });
      if (!(await isActiveRole(supabase, organization.id, proposal.role))) {
        return NextResponse.json({ error: 'Role is not active' }, { status: 400 });
      }

      const title = stringField(body.title) || proposal.title;
      const dayTrigger = typeof body.day_trigger === 'number' ? body.day_trigger : proposal.suggested_day_trigger;
      const targetRampDays = await roleTargetRampDays(supabase, organization.id, proposal.role);
      if (!Number.isInteger(dayTrigger) || dayTrigger < 0 || dayTrigger > targetRampDays) {
        return NextResponse.json({ error: `Day must be between 0 and ${targetRampDays} for this role` }, { status: 400 });
      }
      const [activeDayConflict, draftDayConflict] = await Promise.all([
        hasActiveMilestoneOnDay({
          supabase,
          organizationId: organization.id,
          role: proposal.role,
          dayTrigger,
        }),
        hasDraftProposalOnDay({
          supabase,
          organizationId: organization.id,
          role: proposal.role,
          dayTrigger,
          excludeProposalId: proposal.id,
        }),
      ]);
      if (activeDayConflict || draftDayConflict) {
        return NextResponse.json({ error: `Day ${dayTrigger} already has a learning step for this role` }, { status: 409 });
      }
      const capabilityOutcome = stringField(body.capability_outcome) || proposal.capability_outcome;
      const briefingGoal = stringField(body.briefing_goal) || proposal.briefing_goal;
      const realWorkTrigger = stringField(body.real_work_trigger) || proposal.real_work_trigger;
      const retrievalBrief = stringField(body.retrieval_brief) || proposal.retrieval_brief;
      const successSignals = stringArray(body.success_signals).length > 0 ? stringArray(body.success_signals) : proposal.success_signals;
      const requirements = evidenceRequirements(body.evidence_requirements).length > 0
        ? evidenceRequirements(body.evidence_requirements)
        : proposal.evidence_requirements;
      if (await hasMilestoneContentConflict({
        supabase,
        organizationId: organization.id,
        role: proposal.role,
        candidate: {
          title,
          capability_outcome: capabilityOutcome,
          briefing_goal: briefingGoal,
          real_work_trigger: realWorkTrigger,
          success_signals: successSignals,
          retrieval_brief: retrievalBrief,
          evidence_requirements: requirements,
        },
        excludeProposalId: proposal.id,
      })) {
        return NextResponse.json({ error: 'This learning step overlaps with an existing milestone or draft for this role' }, { status: 409 });
      }

      const { data: milestone, error: milestoneError } = await supabase
        .from('ramp_milestones')
        .insert({
          organization_id: organization.id,
          role: proposal.role,
          day_trigger: dayTrigger,
          title,
          description: capabilityOutcome,
          knowledge_query: retrievalBrief,
          capability_outcome: capabilityOutcome,
          briefing_goal: briefingGoal,
          real_work_trigger: realWorkTrigger,
          success_signals: successSignals,
          retrieval_brief: retrievalBrief,
          evidence_requirements: requirements,
          source_evidence: proposal.source_evidence,
          confidence: proposal.confidence,
          status: 'active',
          approved_from_proposal_id: proposal.id,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (milestoneError || !milestone) throw milestoneError ?? new Error('Milestone approval insert failed');

      await supabase
        .from('milestone_proposals')
        .update({
          status: 'approved',
          approved_milestone_id: milestone.id,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', proposal.id)
        .eq('organization_id', organization.id)
        .eq('status', 'draft');

      log.info('proposal_approved', {
        userId: user.id,
        organizationId: organization.id,
        proposalId: proposal.id,
        milestoneId: milestone.id,
        role: milestone.role,
        dayTrigger: milestone.day_trigger,
      });

      return NextResponse.json({ milestone }, { status: 201 });
    }

    const { day_trigger, title, description, knowledge_query } = body;
    const role = normalizeRoleName(body.role ?? '');
    const capabilityOutcome = stringField(body.capability_outcome) || stringField(description);
    const briefingGoal = stringField(body.briefing_goal) || capabilityOutcome;
    const realWorkTrigger = stringField(body.real_work_trigger);
    const retrievalBrief = stringField(body.retrieval_brief) || stringField(knowledge_query);
    const requirements = evidenceRequirements(body.evidence_requirements);

    if (!role || day_trigger === undefined || !title || !capabilityOutcome || !briefingGoal || !realWorkTrigger || !retrievalBrief) {
      return NextResponse.json({
        error: 'role, day_trigger, title, capability_outcome, briefing_goal, real_work_trigger, and retrieval_brief are required',
      }, { status: 400 });
    }

    if (!isRole(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
    if (!(await isActiveRole(supabase, organization.id, role))) {
      return NextResponse.json({ error: 'Role is not active' }, { status: 400 });
    }
    const targetRampDays = await roleTargetRampDays(supabase, organization.id, role);
    if (!Number.isInteger(day_trigger) || day_trigger < 0 || day_trigger > targetRampDays) {
      return NextResponse.json({ error: `Day must be between 0 and ${targetRampDays} for this role` }, { status: 400 });
    }
    const [activeDayConflict, draftDayConflict] = await Promise.all([
      hasActiveMilestoneOnDay({
        supabase,
        organizationId: organization.id,
        role,
        dayTrigger: day_trigger,
      }),
      hasDraftProposalOnDay({
        supabase,
        organizationId: organization.id,
        role,
        dayTrigger: day_trigger,
      }),
    ]);
    if (activeDayConflict || draftDayConflict) {
      return NextResponse.json({ error: `Day ${day_trigger} already has a learning step for this role` }, { status: 409 });
    }
    if (await hasMilestoneContentConflict({
      supabase,
      organizationId: organization.id,
      role,
      candidate: {
        title,
        capability_outcome: capabilityOutcome,
        briefing_goal: briefingGoal,
        real_work_trigger: realWorkTrigger,
        success_signals: stringArray(body.success_signals),
        retrieval_brief: retrievalBrief,
        evidence_requirements: requirements,
      },
    })) {
      return NextResponse.json({ error: 'This learning step overlaps with an existing milestone or draft for this role' }, { status: 409 });
    }

    const { data: milestone, error } = await supabase
      .from('ramp_milestones')
      .insert({
        organization_id: organization.id,
        role,
        day_trigger,
        title,
        description: capabilityOutcome,
        knowledge_query: retrievalBrief,
        capability_outcome: capabilityOutcome,
        briefing_goal: briefingGoal,
        real_work_trigger: realWorkTrigger,
        success_signals: stringArray(body.success_signals),
        retrieval_brief: retrievalBrief,
        evidence_requirements: requirements,
        confidence: 0.5,
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !milestone) throw error ?? new Error('Insert failed');

    log.info('milestone_created', {
      userId: user.id,
      organizationId: organization.id,
      milestoneId: milestone.id,
      role: milestone.role,
      dayTrigger: milestone.day_trigger,
    });

    return NextResponse.json({ milestone }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/milestones] POST failed', error);
    return NextResponse.json({ error: 'Failed to create milestone', detail: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { supabase, organization } = await requireWorkspaceAdmin(user);

    const body = (await request.json()) as {
      milestone_id?: string;
      role?: string;
      day_trigger?: number;
      title?: string;
      capability_outcome?: string;
      briefing_goal?: string;
      real_work_trigger?: string;
      success_signals?: unknown;
      retrieval_brief?: string;
      evidence_requirements?: unknown;
    };

    const milestoneId = stringField(body.milestone_id);
    if (!milestoneId) return NextResponse.json({ error: 'milestone_id is required' }, { status: 400 });
    if (body.role !== undefined && !isRole(body.role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const dayTrigger = body.day_trigger;
    const role = typeof body.role === 'string' ? normalizeRoleName(body.role) : undefined;
    const title = stringField(body.title);
    const capabilityOutcome = stringField(body.capability_outcome);
    const briefingGoal = stringField(body.briefing_goal);
    const realWorkTrigger = stringField(body.real_work_trigger);
    const retrievalBrief = stringField(body.retrieval_brief);

    if (
      typeof dayTrigger !== 'number' ||
      !Number.isInteger(dayTrigger) ||
      dayTrigger < 0 ||
      !title ||
      !capabilityOutcome ||
      !briefingGoal ||
      !realWorkTrigger ||
      !retrievalBrief
    ) {
      return NextResponse.json({
        error: 'day_trigger, title, capability_outcome, briefing_goal, real_work_trigger, and retrieval_brief are required',
      }, { status: 400 });
    }
    if (role && !(await isActiveRole(supabase, organization.id, role))) {
      return NextResponse.json({ error: 'Role is not active' }, { status: 400 });
    }
    const existingRole = role;
    const validationRole = existingRole ?? (await supabase
      .from('ramp_milestones')
      .select('role')
      .eq('id', milestoneId)
      .eq('organization_id', organization.id)
      .single()).data?.role;
    if (!validationRole) return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
    const targetRampDays = await roleTargetRampDays(supabase, organization.id, validationRole);
    if (dayTrigger > targetRampDays) {
      return NextResponse.json({ error: `Day must be between 0 and ${targetRampDays} for this role` }, { status: 400 });
    }
    const [activeDayConflict, draftDayConflict] = await Promise.all([
      hasActiveMilestoneOnDay({
        supabase,
        organizationId: organization.id,
        role: validationRole,
        dayTrigger,
        excludeMilestoneId: milestoneId,
      }),
      hasDraftProposalOnDay({
        supabase,
        organizationId: organization.id,
        role: validationRole,
        dayTrigger,
      }),
    ]);
    if (activeDayConflict || draftDayConflict) {
      return NextResponse.json({ error: `Day ${dayTrigger} already has a learning step for this role` }, { status: 409 });
    }
    if (await hasMilestoneContentConflict({
      supabase,
      organizationId: organization.id,
      role: validationRole,
      candidate: {
        title,
        capability_outcome: capabilityOutcome,
        briefing_goal: briefingGoal,
        real_work_trigger: realWorkTrigger,
        success_signals: stringArray(body.success_signals),
        retrieval_brief: retrievalBrief,
        evidence_requirements: evidenceRequirements(body.evidence_requirements),
      },
      excludeMilestoneId: milestoneId,
    })) {
      return NextResponse.json({ error: 'This learning step overlaps with an existing milestone or draft for this role' }, { status: 409 });
    }

    const { data: milestone, error } = await supabase
      .from('ramp_milestones')
      .update({
        ...(role ? { role } : {}),
        day_trigger: dayTrigger,
        title,
        description: capabilityOutcome,
        knowledge_query: retrievalBrief,
        capability_outcome: capabilityOutcome,
        briefing_goal: briefingGoal,
        real_work_trigger: realWorkTrigger,
        success_signals: stringArray(body.success_signals),
        retrieval_brief: retrievalBrief,
        evidence_requirements: evidenceRequirements(body.evidence_requirements),
        updated_at: new Date().toISOString(),
      })
      .eq('id', milestoneId)
      .eq('organization_id', organization.id)
      .eq('status', 'active')
      .select()
      .single();

    if (error || !milestone) return NextResponse.json({ error: 'Milestone not found or update failed' }, { status: 404 });

    log.info('milestone_updated', {
      userId: user.id,
      organizationId: organization.id,
      milestoneId: milestone.id,
      role: milestone.role,
      dayTrigger: milestone.day_trigger,
    });

    return NextResponse.json({ milestone });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/milestones] PATCH failed', error);
    return NextResponse.json({ error: 'Failed to update milestone', detail: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { supabase, organization } = await requireWorkspaceAdmin(user);

    const body = (await request.json().catch(() => ({}))) as { milestone_id?: string; milestone_ids?: unknown };
    const milestoneIds = Array.from(new Set([
      stringField(body.milestone_id),
      stringField(request.nextUrl.searchParams.get('id')),
      ...stringArray(body.milestone_ids),
    ].filter(Boolean))).slice(0, 100);
    if (milestoneIds.length === 0) return NextResponse.json({ error: 'milestone_id is required' }, { status: 400 });

    const { data: milestones, error } = await supabase
      .from('ramp_milestones')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .in('id', milestoneIds)
      .eq('organization_id', organization.id)
      .eq('status', 'active')
      .select('id, role, day_trigger');

    if (error) throw error;
    if ((milestones?.length ?? 0) !== milestoneIds.length) {
      return NextResponse.json({ error: 'One or more learning steps were not found or already removed' }, { status: 404 });
    }

    log.info('milestone_archived', {
      userId: user.id,
      organizationId: organization.id,
      milestoneIds,
      count: milestones?.length ?? 0,
    });

    return NextResponse.json({ milestone: milestones?.[0] ?? null, milestones: milestones ?? [], count: milestones?.length ?? 0 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/milestones] DELETE failed', error);
    return NextResponse.json({ error: 'Failed to remove milestone', detail: message }, { status: 500 });
  }
}
