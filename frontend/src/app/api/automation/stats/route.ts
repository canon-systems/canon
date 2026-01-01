import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createSupabaseClient();

    const url = new URL(request.url);
    const rangeParam = (url.searchParams.get('range') || 'all').toLowerCase();
    const range = ['all', '24h', '7d', '30d'].includes(rangeParam) ? rangeParam : 'all';

    // Get current time and range start (if needed)
    const now = new Date();
    const rangeStart = range === '24h'
      ? new Date(now.getTime() - 24 * 60 * 60 * 1000)
      : range === '7d'
        ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        : range === '30d'
          ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          : null;

    const [
      { count: executions, error: executionsError },
      { count: successfulExecutions, error: successError },
      { count: failedExecutions, error: failedError },
    ] = await Promise.all([
      (rangeStart
        ? supabase
          .from('automation_runs')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('executed_at', rangeStart.toISOString())
        : supabase
          .from('automation_runs')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
      ),
      (rangeStart
        ? supabase
          .from('automation_runs')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('status', 'succeeded')
          .gte('executed_at', rangeStart.toISOString())
        : supabase
          .from('automation_runs')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('status', 'succeeded')
      ),
      (rangeStart
        ? supabase
          .from('automation_runs')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('status', 'failed')
          .gte('executed_at', rangeStart.toISOString())
        : supabase
          .from('automation_runs')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('status', 'failed')
      ),
    ]);

    if (executionsError || successError || failedError) {
      console.error('Error fetching automation runs:', {
        executionsError,
        successError,
        failedError,
        range,
      });
      return NextResponse.json(
        { error: 'Failed to fetch automation statistics' },
        { status: 500 }
      );
    }

    const totalSuccesses = successfulExecutions || 0;
    const totalFailures = failedExecutions || 0;
    const totalRunsForRate = totalSuccesses + totalFailures;
    const successRate = totalRunsForRate > 0
      ? Math.round((totalSuccesses / totalRunsForRate) * 100)
      : 0;

    return NextResponse.json({
      range,
      executions: executions || 0,
      successfulExecutions: totalSuccesses,
      failedExecutions: totalFailures,
      successRate,
    });
  } catch (err: any) {
    console.error('Automation stats error:', err);
    return NextResponse.json(
      {
        error: 'Failed to load automation statistics',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}
