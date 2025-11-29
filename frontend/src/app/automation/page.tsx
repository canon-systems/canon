import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { AutomationPageClient } from './page-client';

export default async function AutomationPage() {
  const { user, session } = await getSession();

  if (!session) {
    redirect('/login');
  }

  const supabase = await createClient();

  // Get all repos (not just ones with automation rules)
  const { data: repos, error: reposError } = await supabase
    .from('workspace_repos')
    .select('id, name, repo_url, default_branch, provider, auth_type, settings, created_at, updated_at')
    .order('created_at', { ascending: false });

  // Get connections for knowledge base providers
  const { data: connections } = await supabase
    .from('oauth_connections')
    .select('id, provider, connection_id, status, metadata, created_at, updated_at')
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  // Extract automation rules and calculate stats
  const allRules: Array<{
    repoId: string;
    repoName: string;
    repoUrl: string;
    ruleId: string;
    ruleName: string;
    enabled: boolean;
    lastRunAt?: string;
    lastRunStatus?: string;
    lastExecution?: any;
  }> = [];

  let totalRules = 0;
  let activeRules = 0;
  let totalExecutions24h = 0;
  let successfulExecutions = 0;

  repos?.forEach((repo) => {
    const settings = repo.settings || {};
    const rules = Array.isArray(settings.automation_rules) ? settings.automation_rules : [];
    const metadata = settings.automation_metadata || {};

    rules.forEach((rule: any) => {
      const ruleId = rule.id || rule.name || 'default';
      const ruleMetadata = metadata[ruleId] || {};
      const enabled = Boolean(rule.enabled);
      
      totalRules++;
      if (enabled) activeRules++;

      // Count executions in last 24h
      const executionHistory = ruleMetadata.execution_history || [];
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      const recentExecutions = executionHistory.filter((exec: any) => {
        try {
          const execTime = new Date(exec.timestamp);
          return execTime >= last24h;
        } catch {
          return false;
        }
      });

      totalExecutions24h += recentExecutions.length;
      successfulExecutions += recentExecutions.filter((e: any) => e.success && !e.skipped).length;

      allRules.push({
        repoId: repo.id,
        repoName: repo.name || 'Untitled Repo',
        repoUrl: repo.repo_url || '',
        ruleId,
        ruleName: rule.name || ruleId,
        enabled,
        lastRunAt: ruleMetadata.last_run_at,
        lastRunStatus: ruleMetadata.last_run_status,
        lastExecution: ruleMetadata.last_execution,
      });
    });
  });

  const successRate = totalExecutions24h > 0 
    ? Math.round((successfulExecutions / totalExecutions24h) * 100) 
    : 0;

  return (
    <AutomationPageClient
      user={user}
      repos={repos || []}
      connections={connections || []}
      allRules={allRules}
      stats={{
        totalRules,
        activeRules,
        executions24h: totalExecutions24h,
        successRate,
      }}
    />
  );
}

