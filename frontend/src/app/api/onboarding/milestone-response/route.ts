import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { recordMilestoneEvidence } from '@/lib/server/milestoneEvidence';

export const dynamic = 'force-dynamic';

function stringField(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

async function loadToken(token: string) {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from('milestone_response_tokens')
    .select(`
      token,
      expires_at,
      used_at,
      new_hire_id,
      milestone_id,
      new_hires ( name ),
      ramp_milestones ( title, capability_outcome, real_work_trigger )
    `)
    .eq('token', token)
    .maybeSingle();

  return { supabase, tokenRow: data };
}

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token') ?? '';
    if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 });

    const { tokenRow } = await loadToken(token);
    if (!tokenRow) return NextResponse.json({ error: 'Milestone response link not found' }, { status: 404 });
    if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Milestone response link expired' }, { status: 410 });
    }

    const hire = Array.isArray(tokenRow.new_hires) ? tokenRow.new_hires[0] : tokenRow.new_hires;
    const milestone = Array.isArray(tokenRow.ramp_milestones) ? tokenRow.ramp_milestones[0] : tokenRow.ramp_milestones;

    return NextResponse.json({
      response: {
        used_at: tokenRow.used_at,
        new_hire_name: hire?.name ?? 'New hire',
        milestone_title: milestone?.title ?? 'Milestone',
        capability_outcome: milestone?.capability_outcome ?? null,
        real_work_trigger: milestone?.real_work_trigger ?? null,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/milestone-response] GET failed', error);
    return NextResponse.json({ error: 'Failed to load milestone response link', detail: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const token = stringField(body.token);
    const responseType = stringField(body.response_type) || 'need_context';
    const message = stringField(body.message);

    if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 });
    if (!['blocked', 'need_context'].includes(responseType)) {
      return NextResponse.json({ error: 'Invalid response_type' }, { status: 400 });
    }
    if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 });

    const { supabase, tokenRow } = await loadToken(token);
    if (!tokenRow) return NextResponse.json({ error: 'Milestone response link not found' }, { status: 404 });
    if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Milestone response link expired' }, { status: 410 });
    }

    const result = await recordMilestoneEvidence({
      supabase,
      newHireId: tokenRow.new_hire_id,
      milestoneId: tokenRow.milestone_id,
      evidenceType: 'new_hire_blocker',
      trustLevel: 'low',
      confidence: 0.2,
      source: 'new_hire_response',
      sourceEventId: `response:${token}:${responseType}`,
      metadata: { response_type: responseType, message },
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    await supabase
      .from('milestone_response_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('token', token);

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/milestone-response] POST failed', error);
    return NextResponse.json({ error: 'Failed to submit milestone response', detail: message }, { status: 500 });
  }
}
