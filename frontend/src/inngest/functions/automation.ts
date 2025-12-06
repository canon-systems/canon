import { inngest } from "../client";
import { createClient } from "@supabase/supabase-js";
import { executeAutomationRule } from "../../lib/server/services/automationRunner";
import { FileSummaryManager } from "../../lib/server/services/fileSummaryManager";
import { detectRepositoryChanges } from "../../lib/server/services/changeDetector";
import { getUserOctokit } from "../../lib/server/github/getUserOctokit";
import { parseRepoUrl } from "../../lib/server/github/github";

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

// Periodic background job to scan for new files and generate summaries
export const scanAndGenerateSummaries = inngest.createFunction(
  {
    id: "scan-and-generate-summaries",
    name: "Scan Repositories for New Files and Generate Summaries",
  },
  {
    cron: "*/10 * * * *", // Run every 10 minutes
  },
  async ({ event, step }) => {
    console.log(`🔍 Scanning repositories for new files at ${new Date().toISOString()}`);

    // Create Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    // Get all active repositories (those that have been set up)
    const { data: activeRepos, error: reposError } = await supabase
      .from('workspace_repos')
      .select(`
        id,
        repo_url,
        default_branch,
        workspace_id,
        repository_setup!inner(setup_status)
      `)
      .eq('repository_setup.setup_status', 'ready');

    if (reposError) {
      console.error('❌ Failed to fetch active repositories:', reposError);
      return { error: 'Failed to fetch repositories' };
    }

    if (!activeRepos || activeRepos.length === 0) {
      console.log('ℹ️ No active repositories found');
      return { scanned: 0, processed: 0 };
    }

    console.log(`📊 Found ${activeRepos.length} active repositories to scan`);

    let totalProcessed = 0;
    let totalScanned = 0;

    // Process each repository
    for (const repo of activeRepos) {
      try {
        console.log(`🔍 Scanning repo: ${repo.repo_url} (${repo.default_branch})`);

        totalScanned++;

        // Detect changes since last summary generation
        const changes = await detectRepositoryChanges({
          supabase,
          userId: repo.workspace_id, // Assuming workspace_id is available
          repoUrl: repo.repo_url,
          branch: repo.default_branch,
        });

        const newFiles = changes.files_added || [];
        if (newFiles.length === 0) {
          console.log(`✅ No new files in ${repo.repo_url}`);
          continue;
        }

        console.log(`🆕 Found ${newFiles.length} new files in ${repo.repo_url}`);

        // Get file contents for new files
        const octokit = await getUserOctokit(supabase, repo.workspace_id);
        const parsed = parseRepoUrl(repo.repo_url);
        if (!parsed) {
          console.error(`❌ Invalid repo URL: ${repo.repo_url}`);
          continue;
        }

        const { owner, repo: repoName } = parsed;
        const filesWithContent: Array<{ path: string; content: string; hash?: string }> = [];

        // Fetch content for new files
        for (const filePath of newFiles) {
          try {
            const { data: fileData } = await octokit.repos.getContent({
              owner,
              repo: repoName,
              path: filePath,
              ref: changes.current_commit_sha,
            });

            if (!Array.isArray(fileData) && fileData.type === 'file' && fileData.content) {
              const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
              filesWithContent.push({
                path: filePath,
                content,
              });
            }
          } catch (error) {
            console.error(`❌ Failed to fetch content for ${filePath}:`, error);
          }
        }

        if (filesWithContent.length === 0) {
          console.log(`⚠️ No accessible files found for ${repo.repo_url}`);
          continue;
        }

        // Generate summaries for new files
        const normalizedRepoId = `github.com/${parsed.owner}/${parsed.repo}`;
        const summaryManager = new FileSummaryManager(supabase, normalizedRepoId, repo.default_branch);

        const result = await summaryManager.updateSummariesIfNeeded(filesWithContent, {
          batchSize: 3,
          onProgress: (progress) => {
            console.log(`📊 ${repo.repo_url}: Summary generation ${progress.processed}/${progress.total}`);
          }
        });

        console.log(`✅ Generated ${result.processed} summaries for ${repo.repo_url} (${result.skipped} skipped, ${result.failed} failed)`);
        totalProcessed += result.processed;

      } catch (error) {
        console.error(`❌ Failed to process repository ${repo.repo_url}:`, error);
      }
    }

    console.log(`🎉 Summary generation complete: scanned ${totalScanned} repos, processed ${totalProcessed} files`);

    return {
      scanned: totalScanned,
      processed: totalProcessed,
      timestamp: new Date().toISOString(),
    };
  }
);
