import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

function rowToSchedule(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    enabled: row.enabled,
    cadence: row.cadence,
    sourceIds: Array.isArray(row.source_ids) ? row.source_ids : [],
    communication: row.communication && typeof row.communication === 'object' ? row.communication : {},
    audiences: Array.isArray(row.audiences) ? row.audiences : [],
    units: Array.isArray(row.units) ? row.units : [],
    lastRunAt: row.last_run_at ?? null,
    lastRunStatus: row.last_run_status ?? null,
    lastRunError: row.last_run_error ?? null,
    runAtTime: row.run_at_time ?? null,
    runAtTimezone: row.run_at_timezone ?? null,
    runAtWeekday: row.run_at_weekday ?? null,
    runAtMonthDay: row.run_at_month_day ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** PATCH /api/schedules/[id] — update a report schedule (partial) */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({})) as {
      name?: string;
      enabled?: boolean;
      cadence?: string;
      runAtTime?: string | null;
      runAtTimezone?: string | null;
      runAtWeekday?: number | null;
      runAtMonthDay?: number | null;
      sourceIds?: string[];
      communication?: Record<string, unknown>;
      audiences?: string[];
      units?: string[];
    };

    const supabase = await createClient();

    const { data: existing, error: fetchError } = await supabase
      .from('report_schedules')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchError) {
      console.error('Schedules PATCH fetch error:', fetchError);
      throw fetchError;
    }
    if (!existing) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.name === 'string') updates.name = body.name.trim() || null;
    if (typeof body.enabled === 'boolean') updates.enabled = body.enabled;
    if (typeof body.cadence === 'string') updates.cadence = body.cadence;
    if (body.runAtTime !== undefined) updates.run_at_time = typeof body.runAtTime === 'string' ? (body.runAtTime.trim() || null) : null;
    if (body.runAtTimezone !== undefined) updates.run_at_timezone = typeof body.runAtTimezone === 'string' ? (body.runAtTimezone.trim() || 'UTC') : 'UTC';
    if (body.runAtWeekday !== undefined) updates.run_at_weekday = typeof body.runAtWeekday === 'number' && body.runAtWeekday >= 0 && body.runAtWeekday <= 6 ? body.runAtWeekday : null;
    if (body.runAtMonthDay !== undefined) updates.run_at_month_day = typeof body.runAtMonthDay === 'number' && body.runAtMonthDay >= 0 && body.runAtMonthDay <= 31 ? body.runAtMonthDay : null;
    if (Array.isArray(body.sourceIds)) {
      updates.source_ids = body.sourceIds.filter((id): id is string => typeof id === 'string');
    }
    if (body.communication && typeof body.communication === 'object') updates.communication = body.communication;
    if (Array.isArray(body.audiences)) {
      updates.audiences = body.audiences.filter((a): a is string => typeof a === 'string');
    }
    if (Array.isArray(body.units)) {
      updates.units = body.units.filter((u): u is string => typeof u === 'string');
    }

    const { data: row, error } = await supabase
      .from('report_schedules')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Schedules PATCH error:', error);
      throw error;
    }

    return NextResponse.json({ schedule: rowToSchedule(row) }, { status: 200 });
  } catch (err: unknown) {
    console.error('Schedules PATCH error:', err);
    return NextResponse.json(
      {
        error: 'Failed to update schedule',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

/** DELETE /api/schedules/[id] — delete a report schedule (runs cascade via FK) */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const supabase = await createClient();

    const { error } = await supabase
      .from('report_schedules')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Schedules DELETE error:', error);
      throw error;
    }

    return NextResponse.json({ deleted: true }, { status: 200 });
  } catch (err: unknown) {
    console.error('Schedules DELETE error:', err);
    return NextResponse.json(
      {
        error: 'Failed to delete schedule',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
