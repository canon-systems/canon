import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { executeAutomationRule } from '@/lib/server/services/automationRunner';
import { updateRuleLastRun } from '@/lib/server/services/automationRules';

/**
 * Manual trigger endpoint for automation rules.
 * Executes automation rules immediately instead of queuing.
 *
 * Request body:
 * - userId: string (required) - The user ID
 * - repoId: string (required) - The repository ID
 * - ruleId: string (required) - The automation rule ID
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { userId, repoId, ruleId } = body;

    if (!userId || !repoId || !ruleId) {
      return NextResponse.json({
        error: 'Missing required fields: userId, repoId, ruleId'
      }, { status: 400 });
    }

    // Ensure user can only trigger their own automations
    if (userId !== user.id) {
      return NextResponse.json({
        error: 'You can only trigger automations for your own account'
      }, { status: 403 });
    }

    const supabase = await createClient();

    // Fetch the repository
    const { data: repo, error: repoError } = await supabase
      .from('workspace_repos')
      .select('*')
      .eq('id', repoId)
      .eq('workspace_id', userId)
      .single();

    if (repoError || !repo) {
      return NextResponse.json(
        { error: 'Repository not found' },
        { status: 404 }
      );
    }

    // Fetch the automation rule from the new table
    const { data: dbRule, error: ruleError } = await supabase
      .from('automation_rules')
      .select('*')
      .eq('repo_id', repoId)
      .eq('rule_id', ruleId)
      .single();

    if (ruleError || !dbRule) {
      return NextResponse.json(
        { error: 'Automation rule not found' },
        { status: 404 }
      );
    }

    if (!dbRule.enabled) {
      return NextResponse.json({
        success: true,
        skipped: true,
        skipReason: 'Rule is disabled'
      });
    }

    // Convert database rule to the expected RuleConfig format
    const rule = {
      id: dbRule.rule_id,
      name: dbRule.name,
      enabled: dbRule.enabled,
      schedule: dbRule.schedule,
      action_preset: dbRule.action_preset,
      significance_analysis: dbRule.significance_analysis,
      target_documents: dbRule.target_documents,
      target_diagrams: dbRule.target_diagrams,
      notifications: dbRule.notifications,
      publish_targets: dbRule.publish_targets,
      // Legacy fields
      generate_doc: dbRule.generate_doc,
      generate_diagram: dbRule.generate_diagram,
      auto_publish: dbRule.auto_publish,
      auto_publish_new_docs: dbRule.auto_publish_new_docs,
      auto_publish_max_changes: dbRule.auto_publish_max_changes,
      auto_publish_max_change_percentage: dbRule.auto_publish_max_change_percentage,
      auto_publish_target: dbRule.auto_publish_target,
    };

    console.log(`[Manual Run] Executing automation rule '${ruleId}' for ${repo.name}`);

    // Execute the automation rule immediately
    const execution = await executeAutomationRule({
      supabase,
      repo,
      rule,
      userId,
    });

    // Update the rule's last run metadata
    await updateRuleLastRun(supabase, repoId, ruleId, userId, {
      ...execution,
      trigger: 'manual',
    });

    const status = execution.success ? 'SUCCESS' : (execution.skipped ? 'SKIPPED' : 'FAILED');
    console.log(`[Manual Run] ${status}: ${execution.actions.join(', ')}`);

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
      executed: true,
      message: 'Automation executed immediately'
    });
  } catch (err: any) {
    console.error('Automation run error:', err);
    return NextResponse.json({
      error: 'Automation run failed',
      detail: err.message || String(err)
    }, { status: 500 });
  }
}

