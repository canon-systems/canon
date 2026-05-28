import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/inngest/client';
import { createLogger } from '@/lib/server/logging';
import type { HireRole, MilestoneEvidenceRequirement } from '@/types/onboarding';

export const dynamic = 'force-dynamic';

const validRoles: HireRole[] = ['AI Solutions Architect', 'Solutions Engineer', 'Implementation Engineer'];
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
  return typeof value === 'string' && validRoles.includes(value as HireRole);
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

async function organizationForUser() {
  const { user } = await getSession();
  if (!user) return { user: null, org: null, supabase: null };

  const supabase = await createClient();
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('owner_id', user.id)
    .single();

  return { user, org, supabase };
}

export async function GET(request: NextRequest) {
  try {
    const { user, org, supabase } = await organizationForUser();
    if (!user || !supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const roleParam = request.nextUrl.searchParams.get('role');
    if (roleParam && !isRole(roleParam)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });

    if (!org) return NextResponse.json({ milestones: [], proposals: [], latest_generation: null });

    let milestoneQuery = supabase
      .from('ramp_milestones')
      .select('*')
      .eq('organization_id', org.id)
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
      .eq('organization_id', org.id)
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
        .eq('organization_id', org.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (proposalError) throw proposalError;
    if (generationError && !isMissingMilestoneGenerationRuns(generationError)) throw generationError;

    log.debug('milestones_loaded', {
      userId: user.id,
      organizationId: org.id,
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
    const { user, org, supabase } = await organizationForUser();
    if (!user || !supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    const body = (await request.json()) as {
      action?: string;
      proposal_id?: string;
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
      const { data: generationRun, error: generationRunError } = await supabase
        .from('milestone_generation_runs')
        .insert({
          organization_id: org.id,
          requested_by: user.id,
          status: 'queued',
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (generationRunError && isMissingMilestoneGenerationRuns(generationRunError)) {
        const result = await inngest.send({
          name: 'onboarding/milestones.generate.requested',
          data: { organizationId: org.id, requestedBy: user.id },
        });
        log.info('generation_requested', {
          userId: user.id,
          organizationId: org.id,
          eventName: 'onboarding/milestones.generate.requested',
          eventIds: eventIds(result),
          statusTracking: 'unavailable',
        });
        return NextResponse.json({ ok: true, requested: true, generation: null });
      }

      if (generationRunError || !generationRun) {
        throw generationRunError ?? new Error('Milestone generation run insert failed');
      }

      const result = await inngest.send({
        name: 'onboarding/milestones.generate.requested',
        data: { organizationId: org.id, requestedBy: user.id, generationRunId: generationRun.id },
      });
      log.info('generation_requested', {
        userId: user.id,
        organizationId: org.id,
        generationRunId: generationRun.id,
        eventName: 'onboarding/milestones.generate.requested',
        eventIds: eventIds(result),
      });
      return NextResponse.json({ ok: true, requested: true, generation: generationRun });
    }

    if (body.action === 'update_proposal') {
      if (!body.proposal_id) return NextResponse.json({ error: 'proposal_id is required' }, { status: 400 });
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

      const { data: proposal, error } = await supabase
        .from('milestone_proposals')
        .update(updates)
        .eq('id', body.proposal_id)
        .eq('organization_id', org.id)
        .eq('status', 'draft')
        .select()
        .single();
      if (error || !proposal) return NextResponse.json({ error: 'Proposal not found or already resolved' }, { status: 404 });
      log.debug('proposal_updated', { userId: user.id, organizationId: org.id, proposalId: proposal.id });
      return NextResponse.json({ proposal });
    }

    if (body.action === 'reject_proposal') {
      if (!body.proposal_id) return NextResponse.json({ error: 'proposal_id is required' }, { status: 400 });
      const { data: proposal, error } = await supabase
        .from('milestone_proposals')
        .update({ status: 'rejected', rejected_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', body.proposal_id)
        .eq('organization_id', org.id)
        .eq('status', 'draft')
        .select()
        .single();
      if (error || !proposal) return NextResponse.json({ error: 'Proposal not found or already resolved' }, { status: 404 });
      log.info('proposal_rejected', {
        userId: user.id,
        organizationId: org.id,
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
        .eq('organization_id', org.id)
        .eq('status', 'draft')
        .single();

      if (proposalError || !proposal) return NextResponse.json({ error: 'Proposal not found or already resolved' }, { status: 404 });

      const title = stringField(body.title) || proposal.title;
      const dayTrigger = typeof body.day_trigger === 'number' ? body.day_trigger : proposal.suggested_day_trigger;
      const capabilityOutcome = stringField(body.capability_outcome) || proposal.capability_outcome;
      const briefingGoal = stringField(body.briefing_goal) || proposal.briefing_goal;
      const realWorkTrigger = stringField(body.real_work_trigger) || proposal.real_work_trigger;
      const retrievalBrief = stringField(body.retrieval_brief) || proposal.retrieval_brief;
      const successSignals = stringArray(body.success_signals).length > 0 ? stringArray(body.success_signals) : proposal.success_signals;
      const requirements = evidenceRequirements(body.evidence_requirements).length > 0
        ? evidenceRequirements(body.evidence_requirements)
        : proposal.evidence_requirements;

      const { data: milestone, error: milestoneError } = await supabase
        .from('ramp_milestones')
        .insert({
          organization_id: org.id,
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
        .eq('id', proposal.id);

      log.info('proposal_approved', {
        userId: user.id,
        organizationId: org.id,
        proposalId: proposal.id,
        milestoneId: milestone.id,
        role: milestone.role,
        dayTrigger: milestone.day_trigger,
      });

      return NextResponse.json({ milestone }, { status: 201 });
    }

    const { role, day_trigger, title, description, knowledge_query } = body;
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

    const { data: milestone, error } = await supabase
      .from('ramp_milestones')
      .insert({
        organization_id: org.id,
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
      organizationId: org.id,
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
    const { user, org, supabase } = await organizationForUser();
    if (!user || !supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

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
    const role = body.role as HireRole | undefined;
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
      .eq('organization_id', org.id)
      .eq('status', 'active')
      .select()
      .single();

    if (error || !milestone) return NextResponse.json({ error: 'Milestone not found or update failed' }, { status: 404 });

    log.info('milestone_updated', {
      userId: user.id,
      organizationId: org.id,
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
    const { user, org, supabase } = await organizationForUser();
    if (!user || !supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as { milestone_id?: string };
    const milestoneId = stringField(body.milestone_id) || stringField(request.nextUrl.searchParams.get('id'));
    if (!milestoneId) return NextResponse.json({ error: 'milestone_id is required' }, { status: 400 });

    const { data: milestone, error } = await supabase
      .from('ramp_milestones')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', milestoneId)
      .eq('organization_id', org.id)
      .eq('status', 'active')
      .select('id, role, day_trigger')
      .single();

    if (error || !milestone) return NextResponse.json({ error: 'Milestone not found or already removed' }, { status: 404 });

    log.info('milestone_archived', {
      userId: user.id,
      organizationId: org.id,
      milestoneId: milestone.id,
      role: milestone.role,
      dayTrigger: milestone.day_trigger,
    });

    return NextResponse.json({ milestone });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/milestones] DELETE failed', error);
    return NextResponse.json({ error: 'Failed to remove milestone', detail: message }, { status: 500 });
  }
}
