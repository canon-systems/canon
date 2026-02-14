import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/inngest';
import { getNextRunAt, simpleToRrule } from '@/lib/server/schedules/rrule';

/** GET /api/schedules — list report schedules for the current user. Optional ?type=diff */
export async function GET(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const typeParam = searchParams.get('type'); // 'diff' | omit for all

    const supabase = await createClient();
    let query = supabase
      .from('report_schedules')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (typeParam === 'diff') {
      query = query.eq('type', typeParam);
    } else if (typeParam === 'projection') {
      return NextResponse.json({ schedules: [] }, { status: 200 });
    }

    const { data: rows, error } = await query;

    if (error) {
      console.error('Schedules GET error:', error);
      throw error;
    }

    const schedules = (rows || []).map((row) => rowToSchedule(row));
    return NextResponse.json({ schedules }, { status: 200 });
  } catch (err: unknown) {
    console.error('Schedules GET error:', err);
    return NextResponse.json(
      {
        error: 'Failed to load schedules',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

/** POST /api/schedules — create a report schedule */
export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({})) as {
      type?: string;
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

    if (body.type === 'projection') {
      return NextResponse.json({ error: 'Projection schedules are deprecated.' }, { status: 400 });
    }
    const type = 'diff';
    const name = typeof body.name === 'string' ? body.name.trim() || null : null;
    const enabled = typeof body.enabled === 'boolean' ? body.enabled : true;
    const cadence = typeof body.cadence === 'string' ? body.cadence : 'daily';
    const runAtTime = typeof body.runAtTime === 'string' ? body.runAtTime.trim() || null : null;
    const runAtTimezone = typeof body.runAtTimezone === 'string' ? body.runAtTimezone.trim() || null : 'UTC';
    const runAtWeekday = typeof body.runAtWeekday === 'number' && body.runAtWeekday >= 0 && body.runAtWeekday <= 6 ? body.runAtWeekday : null;
    const runAtMonthDay = typeof body.runAtMonthDay === 'number' && body.runAtMonthDay >= 0 && body.runAtMonthDay <= 31 ? body.runAtMonthDay : null;
    const sourceIds = Array.isArray(body.sourceIds)
      ? body.sourceIds.filter((id): id is string => typeof id === 'string').map((id) => id)
      : [];
    const communication = body.communication && typeof body.communication === 'object' ? body.communication : {};
    const audiences = Array.isArray(body.audiences)
      ? body.audiences.filter((a): a is string => typeof a === 'string')
      : [];
    const units = Array.isArray(body.units)
      ? body.units.filter((u): u is string => typeof u === 'string')
      : [];

    const supabase = await createClient();
    const simple = simpleToRrule({
      cadence,
      runAtTime,
      runAtWeekday,
      runAtMonthDay,
    });
    const now = new Date();
    const nextRunAt = simple ? getNextRunAt(simple.rrule, simple.dtstart, now) : null;

    const insertPayload: Record<string, unknown> = {
      user_id: user.id,
      type,
      name,
      enabled,
      cadence,
      run_at_time: runAtTime,
      run_at_timezone: runAtTimezone,
      run_at_weekday: runAtWeekday,
      run_at_month_day: runAtMonthDay,
      source_ids: sourceIds,
      communication,
      audiences,
      units,
      updated_at: new Date().toISOString(),
    };
    if (simple) {
      insertPayload.rrule = simple.rrule;
      insertPayload.dtstart = simple.dtstart.toISOString();
      insertPayload.next_run_at = nextRunAt?.toISOString() ?? null;
    }

    const { data: row, error } = await supabase
      .from('report_schedules')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error('Schedules POST error:', error);
      throw error;
    }

    if (row?.id && nextRunAt && row.enabled) {
      await inngest.send({
        name: 'report/schedule.tick',
        data: { scheduleId: row.id, next_run_at: nextRunAt.toISOString() },
      });
    }

    return NextResponse.json({ schedule: rowToSchedule(row) }, { status: 201 });
  } catch (err: unknown) {
    console.error('Schedules POST error:', err);
    return NextResponse.json(
      {
        error: 'Failed to create schedule',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

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
    rrule: row.rrule ?? null,
    dtstart: row.dtstart ?? null,
    nextRunAt: row.next_run_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
