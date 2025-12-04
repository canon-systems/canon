import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/automation/stats
 * Get automation execution statistics for the current user
 */
export async function GET() {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();

    // Get execution stats for the last 24 hours
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const { data: executions, error } = await supabase
      .from('automation_runs')
      .select('success, skipped')
      .eq('workspace_id', user.id)
      .gte('executed_at', last24h.toISOString());

    if (error) {
      throw error;
    }

    const executions24h = executions?.length || 0;
    const successfulExecutions = executions?.filter(e => e.success && !e.skipped).length || 0;

    return NextResponse.json({
      executions24h,
      successfulExecutions,
    });
  } catch (err: any) {
    console.error('Automation stats error:', err);
    return NextResponse.json(
      {
        error: 'Failed to get automation stats',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}
