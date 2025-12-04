import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getDueRules, updateRuleLastRun } from '@/lib/server/services/automationRules';
import { executeAutomationRule } from '@/lib/server/services/automationRunner';

/**
 * POST /api/automation/heartbeat
 * Heartbeat endpoint called by GitHub Actions to check for and execute due automation rules
 * This replaces the QStash scheduling system
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate using shared secret token
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.HEARTBEAT_TOKEN;

    if (!expectedToken) {
      console.error('HEARTBEAT_TOKEN environment variable not set');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    if (token !== expectedToken) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    console.log('🔄 Automation heartbeat triggered');

    // Use service role client to access all automation rules
    const supabase = createServiceRoleClient();

    // Initialize next_run_at for any rules that don't have it set yet
    // This ensures existing rules become available for execution
    const { error: initError } = await supabase
      .from('automation_rules')
      .update({
        next_run_at: new Date().toISOString()
      })
      .is('next_run_at', null)
      .eq('enabled', true)
      .not('schedule', 'is', null);

    if (initError) {
      console.error('Error initializing next_run_at for existing rules:', initError);
    } else {
      console.log('✅ Initialized next_run_at for existing rules');
    }

    // Get all due automation rules across all workspaces
    const dueRules = await getDueRules(supabase);

    console.log(`📋 Found ${dueRules.length} due automation rules`);

    if (dueRules.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        message: 'No due automation rules found'
      });
    }

    // Process each due rule
    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const dueRule of dueRules) {
      try {
        console.log(`🚀 Executing automation rule: ${dueRule.rule.name || dueRule.rule_id} for repo: ${dueRule.repo.name}`);

        // Execute the automation rule
        const execution = await executeAutomationRule({
          supabase,
          repo: dueRule.repo,
          rule: dueRule.rule,
          userId: dueRule.repo.workspace_id,
        });

        // Update the rule's last run metadata
        await updateRuleLastRun(
          supabase,
          dueRule.repo_id,
          dueRule.rule_id,
          dueRule.repo.workspace_id,
          {
            ...execution,
            trigger: 'scheduled',
          }
        );

        if (execution.success) {
          successCount++;
          console.log(`✅ Rule executed successfully: ${execution.actions.join(', ')}`);
        } else {
          errorCount++;
          console.error(`❌ Rule execution failed: ${execution.errors.join(', ')}`);
        }

        results.push({
          repoId: dueRule.repo_id,
          ruleId: dueRule.rule_id,
          ruleName: dueRule.rule.name || dueRule.rule_id,
          success: execution.success,
          actions: execution.actions,
          errors: execution.errors,
          skipped: execution.skipped,
          skipReason: execution.skipReason,
        });

      } catch (error: any) {
        errorCount++;
        console.error(`💥 Error executing rule ${dueRule.rule_id}:`, error);
        results.push({
          repoId: dueRule.repo_id,
          ruleId: dueRule.rule_id,
          ruleName: dueRule.rule.name || dueRule.rule_id,
          success: false,
          actions: [],
          errors: [error.message || String(error)],
          skipped: false,
        });
      }
    }

    console.log(`📊 Heartbeat complete: ${successCount} successful, ${errorCount} failed`);

    return NextResponse.json({
      success: true,
      processed: dueRules.length,
      successful: successCount,
      failed: errorCount,
      results,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('💥 Heartbeat error:', error);
    return NextResponse.json(
      {
        error: 'Heartbeat failed',
        detail: error.message || String(error),
      },
      { status: 500 }
    );
  }
}
