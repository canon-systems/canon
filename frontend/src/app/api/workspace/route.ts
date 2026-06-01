import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import {
  createWorkspaceForUser,
  getOrganizationForUser,
  workspaceErrorResponse,
} from '@/lib/server/organization';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function stringField(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function GET() {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = await createClient();
    const organization = await getOrganizationForUser(supabase, user);
    return NextResponse.json({ workspace: organization });
  } catch (error: unknown) {
    console.error('[api/workspace] GET failed', error);
    return workspaceErrorResponse(error, 'Failed to load workspace');
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { name?: unknown };
    const name = stringField(body.name);

    if (name.length < 2 || name.length > 120) {
      return NextResponse.json({ error: 'Workspace name must be 2-120 characters' }, { status: 400 });
    }

    const supabase = await createClient();
    const workspace = await createWorkspaceForUser(supabase, user, { name });
    return NextResponse.json({ workspace }, { status: 201 });
  } catch (error: unknown) {
    console.error('[api/workspace] POST failed', error);
    return workspaceErrorResponse(error, 'Failed to create workspace');
  }
}
