import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { executeAutomationRule } from '@/lib/server/services/automationRunner';
import { updateRuleLastRun } from '@/lib/server/services/automationRules';
import { rescheduleAutomationRule } from '@/lib/server/services/qstashService';

interface AutomationExecutionRequest {
    userId: string;
    repoId: string;
    ruleId: string;
    scheduled?: boolean;
    manual?: boolean;
}

/**
 * Execute a specific automation rule
 * This endpoint is called by QStash for scheduled automations
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

        // Get the automation rules for this repo
        const settings = repo.settings || {};
        const rules = Array.isArray(settings.automation_rules) ? settings.automation_rules : [];
        const rule = rules.find((r: any) => r.id === ruleId || r.name === ruleId);

        if (!rule) {
            console.error('Rule not found:', ruleId);
            return NextResponse.json(
                { error: 'Automation rule not found' },
                { status: 404 }
            );
        }

        if (!rule.enabled) {
            return NextResponse.json({
                success: true,
                skipped: true,
                skipReason: 'Rule is disabled'
            });
        }

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

        // Auto-reschedule if this was a scheduled execution and it succeeded
        if (scheduled && execution.success && !execution.skipped) {
            try {
                console.log(`📅 Rescheduling smart automation: ${repo.name} - ${rule.name || ruleId}`);
                await rescheduleAutomationRule({
                    userId,
                    repoId,
                    ruleId,
                    schedule: rule.schedule,
                });
            } catch (rescheduleError) {
                console.error('Failed to reschedule smart automation:', rescheduleError);
                // Don't fail the execution if rescheduling fails
            }
        }

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
