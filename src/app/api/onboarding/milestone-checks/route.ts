import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { requireWorkspace } from '@/lib/server/organization';
import { scanMilestoneEvidenceForOrganization } from '@/lib/server/milestoneEvidenceScanner';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function stringField(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as Record<string, unknown>;
    const newHireId = stringField(body.new_hire_id);
    if (!newHireId) return NextResponse.json({ error: 'New hire is required' }, { status: 400 });

    const { supabase, organization } = await requireWorkspace(user);
    const { data: hire } = await supabase
      .from('new_hires')
      .select('id')
      .eq('id', newHireId)
      .eq('organization_id', organization.id)
      .single();

    if (!hire) return NextResponse.json({ error: 'New hire not found' }, { status: 404 });

    const result = await scanMilestoneEvidenceForOrganization({
      supabase,
      organizationId: organization.id,
      hireId: newHireId,
      triggerType: 'manual',
    });

    if (result.hires > 0 && result.runsRecorded === 0) {
      throw new Error('Milestone check result was not saved');
    }

    const { data: check } = await supabase
      .from('milestone_check_runs')
      .select('*')
      .eq('new_hire_id', newHireId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({ result, check: check ?? null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/milestone-checks] POST failed', error);
    return NextResponse.json({
      error: 'Canon could not finish this check. Please try again.',
      detail: message,
    }, { status: 500 });
  }
}
