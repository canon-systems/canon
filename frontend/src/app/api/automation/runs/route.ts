import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/automation/runs
 * Get automation runs for the current user
 */
export async function GET() {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();

    // Get all automation runs for the user, ordered by execution time descending
    const { data: runs, error } = await supabase
      .from('automation_runs')
      .select('*')
      .eq('workspace_id', user.id)
      .order('executed_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json(runs || []);
  } catch (err: any) {
    console.error('Automation runs error:', err);
    return NextResponse.json(
      {
        error: 'Failed to get automation runs',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}
