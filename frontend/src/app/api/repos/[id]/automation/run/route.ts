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

    // Fetch automation rules from the new table
    const { data: rules, error: rulesError } = await supabase
      .from('automation_rules')
      .select('*')
      .eq('repo_id', repoId);

    if (rulesError) {
      console.error('Error fetching automation rules:', rulesError);
      return NextResponse.json(
        { error: 'Failed to fetch automation rules' },
        { status: 500 }
      );
    }

    if (!rules || rules.length === 0) {
      return NextResponse.json(
        { error: 'No automation rules configured for this repository' },
        { status: 400 }
      );
    }

    // Find the specific rule to run (default to first rule if not specified)
    const ruleId = body.ruleId || rules[0].rule_id;
    const dbRule = rules.find((r: any) => r.rule_id === ruleId);

    if (!dbRule) {
      return NextResponse.json(
        { error: `Automation rule '${ruleId}' not found` },
        { status: 404 }
      );
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

    console.log(`[Manual Run] Triggering automation rule '${ruleId}' for ${repo.name}`);

    // Execute the automation rule
    const execution = await executeAutomationRule({
      supabase,
      repo,
      rule,
      userId: user.id,
    });

    // Update the rule's last run metadata (mark as manual trigger)
    await updateRuleLastRun(supabase, repoId, ruleId, user.id, {
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
      // Add more detailed stats for better UX
      stats: {
        // TODO: Add actual stats when executeAutomationRule returns them
        filesProcessed: 0,
        documentsUpdated: 0,
        documentsCreated: 0,
        timeElapsed: 0,
      },
      executionLog: [], // Array of step-by-step log messages
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

