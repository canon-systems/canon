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

    // Query automation_runs for the last 24 hours
    const { data: runs, error } = await supabase
      .from('automation_runs')
      .select('status')
      .eq('user_id', user.id)
      .gte('executed_at', twentyFourHoursAgo.toISOString())
      .order('executed_at', { ascending: false });

    if (error) {
      console.error('Error fetching automation runs:', error);
      return NextResponse.json(
        { error: 'Failed to fetch automation statistics' },
        { status: 500 }
      );
    }

    // Calculate statistics
    const executions24h = runs?.length || 0;
    const successfulExecutions = runs?.filter(run => run.status === 'succeeded').length || 0;

    return NextResponse.json({
      executions24h,
      successfulExecutions,
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
