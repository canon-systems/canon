import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';
import { updateRuleLastRun } from '@/lib/server/services/automationRules';

/**
 * POST /api/repos/[id]/automation/cancel
 * Record a cancelled automation run in the execution history.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: repoId } = await params;
    const body = await request.json().catch(() => ({})) as {
      ruleId?: string;
    };

    if (!body.ruleId) {
      return NextResponse.json(
        { error: 'ruleId is required' },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseClient();

    // Verify the repository belongs to the user
    const { data: repo, error: repoError } = await supabase
      .from('workspace_repos')
      .select('id, name')
      .eq('id', repoId)
      .eq('workspace_id', user.id)
      .single();

    if (repoError || !repo) {
      return NextResponse.json(
        { error: 'Repository not found' },
        { status: 404 }
      );
    }

    console.log(`[Cancel Run] Recording cancelled run for rule '${body.ruleId}' in repo ${repo.name} (${repoId})`);

    // Record the cancellation in execution history
    await updateRuleLastRun(supabase, repoId, body.ruleId, user.id, {
      success: false,
      actions: [],
      errors: ['Run cancelled by user'],
      skipped: false,
      skipReason: undefined,
      trigger: 'manual',
    });

    return NextResponse.json({
      success: true,
      message: 'Cancellation recorded',
    });
  } catch (err: any) {
    console.error('[Cancel Run] Error:', err);
    return NextResponse.json(
      {
        error: 'Failed to record cancellation',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

