import { inngest } from "../client";
import { createClient } from "@supabase/supabase-js";
import { executeAutomationRule } from "../../lib/server/services/automationRunner";

// Cron matching utility
function shouldRunBasedOnCron(cronExpression: string, currentDate: Date = new Date()): boolean {
  try {
    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length !== 5) return false;

    const [minute, hour, day, month, weekday] = parts;

    // For now, do simple matching - you can enhance this with a proper cron parser
    const currentMinute = currentDate.getUTCMinutes();
    const currentHour = currentDate.getUTCHours();
    const currentDay = currentDate.getUTCDate();
    const currentMonth = currentDate.getUTCMonth() + 1;
    const currentWeekday = currentDate.getUTCDay();

    // Simple matching logic (can be enhanced)
    const minuteMatch = minute === '*' || minute === String(currentMinute) ||
      (minute.startsWith('*/') && currentMinute % parseInt(minute.slice(2)) === 0);
    const hourMatch = hour === '*' || hour === String(currentHour) ||
      (hour.startsWith('*/') && currentHour % parseInt(hour.slice(2)) === 0);
    const dayMatch = day === '*' || day === String(currentDay);
    const monthMatch = month === '*' || month === String(currentMonth);
    const weekdayMatch = weekday === '*' || weekday === String(currentWeekday);

    return minuteMatch && hourMatch && dayMatch && monthMatch && weekdayMatch;
  } catch (error) {
    console.error('Error parsing cron expression:', cronExpression, error);
    return false;
  }
}

// Scheduled function that runs every 5 minutes and checks all automation rules
export const checkAndRunAutomations = inngest.createFunction(
  {
    id: "check-and-run-automations",
    name: "Check and Run Scheduled Automations",
  },
  {
    cron: "*/1 * * * *", // Run every 1 minutes
  },
  async ({ event, step }) => {
    console.log(`🔍 Checking for automations to run at ${new Date().toISOString()}`);

    // Create Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    // Get all enabled automation rules with schedules
    const { data: rules, error } = await supabase
      .from('automation_rules')
      .select('*')
      .eq('enabled', true)
      .not('schedule', 'is', null);

    if (error) {
      console.error('❌ Failed to fetch automation rules:', error);
      return { error: 'Failed to fetch rules' };
    }

    if (!rules || rules.length === 0) {
      console.log('ℹ️ No enabled automation rules found');
      return { checked: 0, executed: 0 };
    }

    const currentTime = new Date();
    let executed = 0;

    for (const rule of rules) {
      try {
        // Check if this rule should run based on its cron schedule
        if (!shouldRunBasedOnCron(rule.schedule, currentTime)) {
          continue; // Skip this rule
        }

        console.log(`🚀 Executing automation rule: ${rule.rule_id} for repo: ${rule.repo_id}`);

        // Get repo data
        const { data: repo, error: repoError } = await supabase
          .from('workspace_repos')
          .select('*')
          .eq('id', rule.repo_id)
          .single();

        if (repoError || !repo) {
          console.error(`❌ Repo not found: ${rule.repo_id}`, repoError);
          continue;
        }

        // Execute the automation rule
        const result = await executeAutomationRule({
          supabase,
          repo,
          rule,
          userId: rule.workspace_id,
        });

        // Update last run status
        const updateData: any = {
          last_run_at: new Date().toISOString(),
          last_run_status: result.success ? 'success' : 'failed',
        };

        if (result.errors?.length > 0) {
          updateData.last_run_error = result.errors.join('; ');
        }

        await supabase
          .from('automation_rules')
          .update(updateData)
          .eq('rule_id', rule.rule_id);

        console.log(`✅ Automation completed: ${rule.rule_id}`, {
          success: result.success,
          actions: result.actions?.length || 0,
          errors: result.errors?.length || 0,
        });

        executed++;

      } catch (error: any) {
        console.error(`❌ Automation failed: ${rule.rule_id}`, error);

        // Update with failure status
        await supabase
          .from('automation_rules')
          .update({
            last_run_at: new Date().toISOString(),
            last_run_status: 'failed',
            last_run_error: error.message || String(error),
          })
          .eq('rule_id', rule.rule_id);
      }
    }

    return {
      checked: rules.length,
      executed,
      timestamp: new Date().toISOString(),
    };
  }
);

// Manual trigger function for individual automation rules
export const runAutomation = inngest.createFunction(
  {
    id: "run-automation",
    name: "Execute Specific Automation Rule (Manual)",
  },
  {
    event: "run-automation", // Triggered by event, not cron
  },
  async ({ event, step }) => {
    const { ruleId, repoId, workspaceId } = event.data;

    console.log(`🚀 Manually executing automation rule: ${ruleId} for repo: ${repoId}`);

    // Create Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    // Get fresh rule data from database
    const { data: rule, error: ruleError } = await supabase
      .from('automation_rules')
      .select('*')
      .eq('rule_id', ruleId)
      .eq('repo_id', repoId)
      .single();

    if (ruleError || !rule) {
      console.error(`❌ Rule not found: ${ruleId}`, ruleError);
      return { error: "Rule not found", ruleId };
    }

    // Skip if disabled
    if (!rule.enabled) {
      console.log(`⏭️ Rule disabled: ${ruleId}`);
      return { skipped: true, reason: "Rule disabled", ruleId };
    }

    // Get repo data
    const { data: repo, error: repoError } = await supabase
      .from('workspace_repos')
      .select('*')
      .eq('id', repoId)
      .single();

    if (repoError || !repo) {
      console.error(`❌ Repo not found: ${repoId}`, repoError);
      return { error: "Repo not found", ruleId, repoId };
    }

    try {
      // Execute the automation rule using existing logic
      const result = await executeAutomationRule({
        supabase,
        repo,
        rule,
        userId: workspaceId,
      });

      // Update last run status
      const updateData: any = {
        last_run_at: new Date().toISOString(),
        last_run_status: result.success ? 'success' : 'failed',
      };

      if (result.errors?.length > 0) {
        updateData.last_run_error = result.errors.join('; ');
      }

      await supabase
        .from('automation_rules')
        .update(updateData)
        .eq('rule_id', ruleId);

      console.log(`✅ Automation completed: ${ruleId}`, {
        success: result.success,
        actions: result.actions?.length || 0,
        errors: result.errors?.length || 0,
      });

      return {
        success: result.success,
        ruleId,
        repoId,
        actions: result.actions,
        errors: result.errors,
        timestamp: new Date().toISOString(),
      };

    } catch (error: any) {
      console.error(`❌ Automation failed: ${ruleId}`, error);

      // Update with failure status
      await supabase
        .from('automation_rules')
        .update({
          last_run_at: new Date().toISOString(),
          last_run_status: 'failed',
          last_run_error: error.message || String(error),
        })
        .eq('rule_id', ruleId);

      return {
        error: error.message || String(error),
        ruleId,
        repoId,
        timestamp: new Date().toISOString(),
      };
    }
  }
);
