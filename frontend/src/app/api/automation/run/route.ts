import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDueRules, updateRuleLastRun, AutomationRuleEntry } from '@/lib/server/services/automationRules';
import { executeAutomationRule } from '@/lib/server/services/automationRunner';

/**
 * Manual trigger endpoint for automation rules.
 * Note: The primary scheduler is the Trigger.dev task (check-due-rules) which runs every 1 minute.
 * This endpoint is provided for manual triggering/testing purposes only.
 */
export async function POST(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const dueRules: AutomationRuleEntry[] = await getDueRules(supabase);

    if (dueRules.length === 0) {
      return NextResponse.json({ success: true, rules_checked: 0, rules_executed: 0, results: [] }, { status: 200 });
    }

    const results = [];

    for (const ruleInfo of dueRules) {
      const repo = ruleInfo.repo;
      const rule = ruleInfo.rule;
      const workspaceId = repo.workspace_id || '';

      const execution = await executeAutomationRule({
        supabase,
        repo,
        rule,
        userId: workspaceId,
      });

      results.push({
        repo_id: ruleInfo.repo_id,
        rule_id: ruleInfo.rule_id,
        ...execution,
      });

      // Update metadata for all execution results (success, failed, or skipped)
      await updateRuleLastRun(supabase, ruleInfo.repo_id, ruleInfo.rule_id, workspaceId, execution);
    }

    return NextResponse.json({
      success: true,
      rules_checked: dueRules.length,
      rules_executed: results.length,
      results,
    });
  } catch (err: any) {
    console.error('Automation run error:', err);
    return NextResponse.json({ error: 'Automation run failed', detail: err.message || String(err) }, { status: 500 });
  }
}

