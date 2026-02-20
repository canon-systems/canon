import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { deleteSourceDependents } from '@/lib/server/services/sourceCleanup';
import { sourceUrlFromSourceScope, trackSourceDisconnected } from '@/lib/server/services/usageTracking';
import { resolveSourceDomainValue } from '@/lib/sources/domainMapping';

/**
 * GET: Get a single source configuration
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const { id } = await params;

    const { data, error } = await supabase
      .from('workspace_sources')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err: unknown) {
    console.error('Get source error:', err);
    return NextResponse.json(
      {
        error: 'Failed to get source',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH: Update a source configuration
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const { id } = await params;
    const updates = await request.json() as Record<string, unknown>;

    // Allow updating minimal fields for now
    const allowedFields = ['name', 'scope', 'status_payload', 'last_error'];
    const filteredUpdates: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        filteredUpdates[field] = updates[field];
      }
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'domain')) {
      const value = updates.domain;
      if (value === null || (typeof value === 'string' && value.trim().length === 0)) {
        filteredUpdates.domain = null;
      } else if (typeof value === 'string') {
        filteredUpdates.domain = resolveSourceDomainValue(value);
      } else {
        return NextResponse.json({ error: 'Invalid domain value' }, { status: 400 });
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('workspace_sources')
      .update(filteredUpdates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err: unknown) {
    console.error('Update source error:', err);
    return NextResponse.json(
      {
        error: 'Failed to update source',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE: Delete a source configuration
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const admin = createServiceRoleClient();
    const { id } = await params;

    const { data: source, error: sourceError } = await supabase
      .from('workspace_sources')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (sourceError || !source) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    await deleteSourceDependents({
      supabase: admin,
      userId: user.id,
      sourceId: id,
    });

    const { error } = await admin
      .from('workspace_sources')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      throw error;
    }

    try {
      const sourceUrl = sourceUrlFromSourceScope(source.provider, source.scope as Record<string, unknown> | null);
      await trackSourceDisconnected(
        admin,
        user.id,
        id,
        sourceUrl,
        null,
        source.provider
      );
    } catch (logError) {
      console.warn('Failed to track source disconnect:', logError);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: unknown) {
    console.error('Delete source error:', err);
    return NextResponse.json(
      {
        error: 'Failed to delete source',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
