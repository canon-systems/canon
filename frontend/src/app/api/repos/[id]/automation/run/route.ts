import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';
import { executeAutomationRule } from '@/lib/server/services/automationRunner';
import { updateRuleLastRun } from '@/lib/server/services/automationRules';

/**
 * POST /api/repos/[id]/automation/run
 * Manually trigger an automation rule for a specific repository.
 * This allows users to test their automation rules without waiting for the schedule.
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

    const supabase = await createSupabaseClient();

    // Fetch the repository
    const { data: repo, error: repoError } = await supabase
      .from('workspace_repos')
      .select('*')
      .eq('id', repoId)
      .eq('workspace_id', user.id)
      .single();

    if (repoError || !repo) {
      return NextResponse.json(
        { error: 'Repository not found' },
        { status: 404 }
      );
    }

    const settings = repo.settings || {};
    const rules = Array.isArray(settings.automation_rules) ? settings.automation_rules : [];

    if (rules.length === 0) {
      return NextResponse.json(
        { error: 'No automation rules configured for this repository' },
        { status: 400 }
      );
    }

    // Find the specific rule to run (default to first rule if not specified)
    const ruleId = body.ruleId || rules[0]?.id || rules[0]?.name || 'default';
    const rule = rules.find((r: any) => (r.id || r.name || 'default') === ruleId);

    if (!rule) {
      return NextResponse.json(
        { error: `Automation rule '${ruleId}' not found` },
        { status: 404 }
      );
    }

    console.log(`[Manual Run] Executing automation rule '${ruleId}' for repo ${repo.name} (${repoId})`);

    // Execute the automation rule
    const execution = await executeAutomationRule({
      supabase,
      repo,
      rule,
      userId: user.id,
    });

    // Update the rule's last run metadata
    await updateRuleLastRun(supabase, repoId, ruleId, user.id, execution);

    console.log(`[Manual Run] Completed: success=${execution.success}, skipped=${execution.skipped}, actions=${execution.actions.join(', ')}`);

    return NextResponse.json({
      success: execution.success,
      skipped: execution.skipped,
      skipReason: execution.skipReason,
      actions: execution.actions,
      errors: execution.errors,
      docId: execution.docId,
      diagramId: execution.diagramId,
      publishStatus: execution.publishStatus,
      publishProvider: execution.publishProvider,
      publishResourceId: execution.publishResourceId,
    });
  } catch (err: any) {
    console.error('[Manual Run] Error:', err);
    return NextResponse.json(
      {
        error: 'Failed to run automation rule',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

