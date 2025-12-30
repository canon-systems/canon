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

    // Get current time and 24 hours ago
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      { count: executions24h, error: last24Error },
      { count: successfulExecutions24h, error: last24SuccessError },
      { count: executionsTotal, error: totalError },
      { count: successfulExecutionsTotal, error: totalSuccessError },
    ] = await Promise.all([
      supabase
        .from('automation_runs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('executed_at', twentyFourHoursAgo.toISOString()),
      supabase
        .from('automation_runs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'succeeded')
        .gte('executed_at', twentyFourHoursAgo.toISOString()),
      supabase
        .from('automation_runs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
      supabase
        .from('automation_runs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'succeeded'),
    ]);

    if (last24Error || last24SuccessError || totalError || totalSuccessError) {
      console.error('Error fetching automation runs:', {
        last24Error,
        last24SuccessError,
        totalError,
        totalSuccessError,
      });
      return NextResponse.json(
        { error: 'Failed to fetch automation statistics' },
        { status: 500 }
      );
    }

    const totalRuns = executionsTotal || 0;
    const totalSuccesses = successfulExecutionsTotal || 0;
    const successRate = totalRuns > 0
      ? Math.round((totalSuccesses / totalRuns) * 100)
      : 0;

    return NextResponse.json({
      executions24h: executions24h || 0,
      successfulExecutions24h: successfulExecutions24h || 0,
      executionsTotal: totalRuns,
      successfulExecutionsTotal: totalSuccesses,
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
