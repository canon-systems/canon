import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { HireRole } from '@/types/onboarding';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const roleParam = request.nextUrl.searchParams.get('role');
    const supabase = await createClient();

    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    const orgId = org?.id ?? null;

    let query = supabase
      .from('ramp_milestones')
      .select('*')
      .order('day_trigger', { ascending: true });

    if (roleParam) {
      query = query.eq('role', roleParam);
    }

    const { data: milestones, error } = await query;
    if (error) throw error;

    // For each role, prefer org-specific over global
    const allMilestones = milestones ?? [];
    let result = allMilestones;

    if (orgId) {
      const orgSpecific = allMilestones.filter((m) => m.organization_id === orgId);
      const orgRoles = new Set(orgSpecific.map((m) => m.role));
      const globalFallback = allMilestones.filter((m) => m.organization_id === null && !orgRoles.has(m.role));
      result = [...orgSpecific, ...globalFallback].sort((a, b) => a.day_trigger - b.day_trigger);
    }

    return NextResponse.json({ milestones: result });
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

    const body = (await request.json()) as {
      role?: string;
      day_trigger?: number;
      title?: string;
      description?: string;
      knowledge_query?: string;
    };

    const { role, day_trigger, title, description, knowledge_query } = body;
    if (!role || day_trigger === undefined || !title || !description || !knowledge_query) {
      return NextResponse.json({ error: 'role, day_trigger, title, description, and knowledge_query are required' }, { status: 400 });
    }

    const validRoles: HireRole[] = ['AI Solutions Architect', 'Solutions Engineer', 'Implementation Engineer'];
    if (!validRoles.includes(role as HireRole)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    const { data: milestone, error } = await supabase
      .from('ramp_milestones')
      .insert({ organization_id: org.id, role, day_trigger, title, description, knowledge_query })
      .select()
      .single();

    if (error || !milestone) throw error ?? new Error('Insert failed');

    return NextResponse.json({ milestone }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/milestones] POST failed', error);
    return NextResponse.json({ error: 'Failed to create milestone', detail: message }, { status: 500 });
  }
}
