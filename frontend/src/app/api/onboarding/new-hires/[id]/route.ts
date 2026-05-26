import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { HireRole, HireStatus, MilestoneEvidenceRequirement } from '@/types/onboarding';

export const dynamic = 'force-dynamic';

const VALID_ROLES: HireRole[] = ['AI Solutions Architect', 'Solutions Engineer', 'Implementation Engineer'];
const VALID_STATUSES: HireStatus[] = ['active', 'paused', 'completed'];

function isDateInputValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const supabase = await createClient();

    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    const { data: hire, error: hireError } = await supabase
      .from('new_hires')
      .select('*')
      .eq('id', id)
      .eq('organization_id', org.id)
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

    const { data: milestones } = await supabase
      .from('ramp_milestones')
      .select('*')
      .eq('organization_id', org.id)
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
        .filter((request) => request.status === 'granted')
        .map((request) => String(request.tool_name).toLowerCase())
    );

    const milestonePath = (milestones ?? []).map((milestone) => {
      const tools = requiredTools((milestone.evidence_requirements ?? []) as MilestoneEvidenceRequirement[]);
      return {
        milestone,
        progress: progressByMilestone.get(milestone.id) ?? null,
        evidence: evidenceByMilestone.get(milestone.id) ?? [],
        access_ready: tools.length > 0 && tools.every((tool) => grantedTools.has(tool.toLowerCase())),
        required_tools: tools,
      };
    });

    const nextMilestone = (milestones ?? []).find((milestone) => milestone.day_trigger > hire.ramp_day) ?? null;

    return NextResponse.json({
      hire,
      deliveries: deliveries ?? [],
      access_requests: accessRequests ?? [],
      next_milestone: nextMilestone,
      milestone_path: milestonePath,
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
    const supabase = await createClient();

    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

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
      if (!VALID_ROLES.includes(body.role as HireRole)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
      }
      patch.role = body.role;
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
      .eq('organization_id', org.id)
      .select()
      .single();

    if (error || !updated) return NextResponse.json({ error: 'New hire not found or update failed' }, { status: 404 });

    return NextResponse.json({ hire: updated });
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
    const supabase = await createClient();

    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    const { error } = await supabase
      .from('new_hires')
      .delete()
      .eq('id', id)
      .eq('organization_id', org.id);

    if (error) return NextResponse.json({ error: 'New hire not found or delete failed' }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/new-hires/:id] DELETE failed', error);
    return NextResponse.json({ error: 'Failed to delete new hire', detail: message }, { status: 500 });
  }
}
