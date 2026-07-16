import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { normalizeManagerCommunication } from '@/lib/onboarding/manager-communication';
import { rampDayFromStartDate } from '@/lib/onboarding/rampDay';
import { normalizeRoleName } from '@/lib/onboarding/roles';
import { isAccessStatusGranted, normalizeToolName, requiredToolsForEvidence } from '@/lib/onboarding/milestone-ramp';
import { requireWorkspace, requireWorkspaceAdmin } from '@/lib/server/organization';
import type { HireStatus, MilestoneEvidenceRequirement } from '@/types/onboarding';

export const dynamic = 'force-dynamic';

const VALID_STATUSES: HireStatus[] = ['active', 'paused', 'completed'];
const MANAGER_FIELD_KEYS = [
  'manager_name',
  'manager_email',
  'manager_slack_user_id',
  'manager_chat_provider',
  'manager_chat_target_id',
] as const;

function isDateInputValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const { supabase, organization } = await requireWorkspace(user);

    const { data: hire, error: hireError } = await supabase
      .from('new_hires')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organization.id)
      .single();

    if (hireError || !hire) return NextResponse.json({ error: 'New hire not found' }, { status: 404 });

    const { data: deliveries } = await supabase
      .from('ramp_deliveries')
      .select('*, milestone:ramp_milestones(*)')
      .eq('new_hire_id', id)
      .order('created_at', { ascending: false });

    const { data: accessRequests } = await supabase
      .from('access_requests')
      .select('*')
      .eq('new_hire_id', id)
      .order('created_at', { ascending: true });

    const { data: milestoneChecks } = await supabase
      .from('milestone_check_runs')
      .select('*')
      .eq('new_hire_id', id)
      .order('created_at', { ascending: false })
      .limit(12);

    const { data: milestones } = await supabase
      .from('ramp_milestones')
      .select('*')
      .eq('organization_id', organization.id)
      .eq('role', hire.role)
      .eq('status', 'active')
      .order('day_trigger', { ascending: true })
      .order('created_at', { ascending: true });

    const milestoneIds = (milestones ?? []).map((milestone) => milestone.id);

    const [{ data: progressRows }, { data: evidenceRows }] = milestoneIds.length > 0
      ? await Promise.all([
          supabase
            .from('new_hire_milestone_progress')
            .select('*')
            .eq('new_hire_id', id)
            .in('milestone_id', milestoneIds),
          supabase
            .from('milestone_evidence')
            .select('*')
            .eq('new_hire_id', id)
            .in('milestone_id', milestoneIds)
            .order('created_at', { ascending: false }),
        ])
      : [{ data: [] }, { data: [] }];

    const progressByMilestone = new Map((progressRows ?? []).map((row) => [row.milestone_id, row]));
    const evidenceByMilestone = new Map<string, typeof evidenceRows>();
    for (const evidence of evidenceRows ?? []) {
      const existing = evidenceByMilestone.get(evidence.milestone_id) ?? [];
      evidenceByMilestone.set(evidence.milestone_id, [...existing, evidence]);
    }

    const grantedTools = new Set(
      (accessRequests ?? [])
        .filter((request) => isAccessStatusGranted(request.status))
        .map((request) => normalizeToolName(String(request.tool_name)))
    );

    const milestonePath = (milestones ?? []).map((milestone) => {
      const tools = requiredToolsForEvidence((milestone.evidence_requirements ?? []) as unknown as MilestoneEvidenceRequirement[]);
      return {
        milestone,
        progress: progressByMilestone.get(milestone.id) ?? null,
        evidence: evidenceByMilestone.get(milestone.id) ?? [],
        access_ready: tools.length > 0 && tools.every((tool) => grantedTools.has(normalizeToolName(tool))),
        required_tools: tools,
      };
    });

    const computedRampDay = rampDayFromStartDate(hire.start_date);
    const hireWithRampDay = { ...hire, ramp_day: computedRampDay };
    const nextMilestone = (milestones ?? []).find((milestone) => milestone.day_trigger > computedRampDay) ?? null;

    return NextResponse.json({
      hire: hireWithRampDay,
      deliveries: deliveries ?? [],
      access_requests: accessRequests ?? [],
      next_milestone: nextMilestone,
      milestone_path: milestonePath,
      milestone_checks: milestoneChecks ?? [],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/new-hires/:id] GET failed', error);
    return NextResponse.json({ error: 'Failed to load new hire', detail: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const { supabase, organization } = await requireWorkspace(user);

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (typeof body.first_name === 'string') {
      const first_name = body.first_name.trim();
      if (!first_name) return NextResponse.json({ error: 'First name is required' }, { status: 400 });
      patch.first_name = first_name;
    }

    if (typeof body.last_name === 'string') {
      const last_name = body.last_name.trim();
      if (!last_name) return NextResponse.json({ error: 'Last name is required' }, { status: 400 });
      patch.last_name = last_name;
    }

    if (typeof body.email === 'string') {
      const email = body.email.trim();
      if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 });
      patch.email = email;
    }

    if (typeof body.role === 'string') {
      const role = normalizeRoleName(body.role);
      const { data: roleProfile } = await supabase
        .from('role_profiles')
        .select('id')
        .eq('organization_id', organization.id)
        .eq('role', role)
        .eq('status', 'active')
        .maybeSingle();
      if (!roleProfile) return NextResponse.json({ error: 'Role is not active' }, { status: 400 });
      patch.role = role;
    }

    if (typeof body.start_date === 'string') {
      if (!isDateInputValue(body.start_date)) {
        return NextResponse.json({ error: 'Invalid start date' }, { status: 400 });
      }
      patch.start_date = body.start_date;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'slack_user_id')) {
      if (typeof body.slack_user_id !== 'string' || !body.slack_user_id.trim()) {
        return NextResponse.json({ error: 'slack_user_id is required' }, { status: 400 });
      }
      patch.slack_user_id = body.slack_user_id.trim();
    }

    if (MANAGER_FIELD_KEYS.some((key) => Object.prototype.hasOwnProperty.call(body, key))) {
      try {
        Object.assign(patch, normalizeManagerCommunication(body));
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Manager communication is required' }, { status: 400 });
      }
    }

    if (typeof body.status === 'string') {
      if (!VALID_STATUSES.includes(body.status as HireStatus)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      patch.status = body.status;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'ramp_day')) {
      if (typeof body.ramp_day !== 'number' || !Number.isInteger(body.ramp_day) || body.ramp_day < 0) {
        return NextResponse.json({ error: 'Invalid ramp day' }, { status: 400 });
      }
      patch.ramp_day = body.ramp_day;
    }

    const { data: updated, error } = await supabase
      .from('new_hires')
      .update(patch)
      .eq('id', id)
      .eq('organization_id', organization.id)
      .select()
      .single();

    if (error || !updated) return NextResponse.json({ error: 'New hire not found or update failed' }, { status: 404 });

    return NextResponse.json({
      hire: {
        ...updated,
        ramp_day: rampDayFromStartDate(updated.start_date),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/new-hires/:id] PATCH failed', error);
    return NextResponse.json({ error: 'Failed to update new hire', detail: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const { supabase, organization } = await requireWorkspaceAdmin(user);

    const { error } = await supabase
      .from('new_hires')
      .delete()
      .eq('id', id)
      .eq('organization_id', organization.id);

    if (error) return NextResponse.json({ error: 'New hire not found or delete failed' }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/new-hires/:id] DELETE failed', error);
    return NextResponse.json({ error: 'Failed to delete new hire', detail: message }, { status: 500 });
  }
}
