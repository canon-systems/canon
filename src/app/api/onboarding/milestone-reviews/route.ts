import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  recordManagerMilestoneDecision,
  type ManagerMilestoneDecision,
} from '@/lib/server/milestoneEvidence';
import { requireWorkspace } from '@/lib/server/organization';

export const dynamic = 'force-dynamic';

const decisions = new Set<ManagerMilestoneDecision>(['verify', 'keep_open', 'mark_blocked', 'unverify']);

function stringField(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isDecision(value: unknown): value is ManagerMilestoneDecision {
  return typeof value === 'string' && decisions.has(value as ManagerMilestoneDecision);
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as Record<string, unknown>;
    const newHireId = stringField(body.new_hire_id);
    const milestoneId = stringField(body.milestone_id);
    const evidenceId = stringField(body.evidence_id) || null;

    if (!newHireId || !milestoneId || !isDecision(body.decision)) {
      return NextResponse.json({ error: 'New hire, learning step, and decision are required' }, { status: 400 });
    }

    const { supabase, organization } = await requireWorkspace(user);
    const { data: hire } = await supabase
      .from('new_hires')
      .select('id')
      .eq('id', newHireId)
      .eq('organization_id', organization.id)
      .single();

    if (!hire) return NextResponse.json({ error: 'New hire not found' }, { status: 404 });

    const result = await recordManagerMilestoneDecision({
      supabase,
      newHireId,
      milestoneId,
      decision: body.decision,
      source: 'manager_review',
      sourceEventId: `manager-review:${newHireId}:${milestoneId}:${body.decision}`,
      metadata: {
        response_type: body.decision,
        reviewed_from: 'new_hires_detail',
        reviewed_evidence_id: evidenceId,
      },
      createdBy: user.id,
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/milestone-reviews] POST failed', error);
    return NextResponse.json({
      error: 'Canon could not save that review. Please try again.',
      detail: message,
    }, { status: 500 });
  }
}
