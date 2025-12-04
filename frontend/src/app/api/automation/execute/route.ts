import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { executeAutomationRule } from '@/lib/server/services/automationRunner';
import { updateRuleLastRun } from '@/lib/server/services/automationRules';

interface AutomationExecutionRequest {
    userId: string;
    repoId: string;
    ruleId: string;
    scheduled?: boolean;
    manual?: boolean;
}

/**
 * Execute a specific automation rule
 * This endpoint is called by the heartbeat system for scheduled automations
 * and can also be called manually for immediate execution
 */
export async function POST(request: NextRequest) {
    try {
        const body: AutomationExecutionRequest = await request.json();
        const { userId, repoId, ruleId, scheduled = false, manual = false } = body;

        if (!userId || !repoId || !ruleId) {
            return NextResponse.json(
                { error: 'Missing required fields: userId, repoId, ruleId' },
                { status: 400 }
            );
        }

        const supabase = await createClient();

        // Get the specific repo and rule
        const { data: repo, error: repoError } = await supabase
            .from('workspace_repos')
            .select('*')
            .eq('id', repoId)
            .eq('workspace_id', userId)
            .single();

        if (repoError || !repo) {
            console.error('Repo not found:', repoError);
            return NextResponse.json(
                { error: 'Repository not found' },
                { status: 404 }
            );
        }

        // Get the automation rule from the new table
        const { data: dbRule, error: ruleError } = await supabase
            .from('automation_rules')
            .select('*')
            .eq('repo_id', repoId)
            .eq('rule_id', ruleId)
            .single();

        if (ruleError || !dbRule) {
            console.error('Rule not found:', ruleId, ruleError);
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

        console.log(`🚀 Executing smart automation: ${repo.name} - ${rule.name || ruleId}`);

        // Execute the smart automation rule (includes significance analysis, batch processing, notifications)
        const execution = await executeAutomationRule({
            supabase,
            repo,
            rule,
            userId,
        });

        // Update rule metadata
        await updateRuleLastRun(supabase, repoId, ruleId, userId, {
            success: execution.success,
            actions: execution.actions,
            errors: execution.errors,
            skipped: execution.skipped,
            skipReason: execution.skipReason,
            trigger: scheduled ? 'scheduled' : (manual ? 'manual' : 'scheduled'),
        });

        return NextResponse.json({
            success: true,
            repoId,
            ruleId,
            userId,
            execution: {
                ...execution,
                trigger: scheduled ? 'scheduled' : (manual ? 'manual' : 'scheduled'),
            },
        });

    } catch (error: any) {
        console.error('Automation execution error:', error);
        return NextResponse.json({
            error: 'Automation execution failed',
            detail: error.message || String(error)
        }, { status: 500 });
    }
}
