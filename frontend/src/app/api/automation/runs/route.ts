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

    // Query all automation_runs for the user
    const { data: runs, error } = await supabase
      .from('automation_runs')
      .select('*')
      .eq('workspace_id', user.id)
      .order('executed_at', { ascending: false });

    if (error) {
      console.error('Error fetching automation runs:', error);
      return NextResponse.json(
        { error: 'Failed to fetch automation runs' },
        { status: 500 }
      );
    }

    return NextResponse.json(runs || []);
  } catch (err: any) {
    console.error('Automation runs error:', err);
    return NextResponse.json(
      {
        error: 'Failed to load automation runs',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}
