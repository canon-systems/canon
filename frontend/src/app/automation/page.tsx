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
  const { data: repos } = await supabase
    .from('workspace_repos')
    .select('id, name, repo_url, default_branch, provider, auth_type, created_at, updated_at')
    .order('created_at', { ascending: false });

  // Get connections for knowledge base providers
  const { data: connections } = await supabase
    .from('oauth_connections')
    .select('id, provider, connection_id, status, metadata, created_at, updated_at')
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  // Get automation rules from the new table
  const { data: rules } = await supabase
    .from('automation_rules')
    .select(`
      *,
      workspace_repos!inner(id, name, repo_url)
    `);

  // Extract automation rules (stats will be calculated client-side from API)
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

  rules?.forEach((rule: any) => {
      const enabled = Boolean(rule.enabled);

      totalRules++;
      if (enabled) activeRules++;

      allRules.push({
      repoId: rule.repo_id,
      repoName: rule.workspace_repos.name || 'Untitled Repo',
      repoUrl: rule.workspace_repos.repo_url || '',
      ruleId: rule.rule_id,
      ruleName: rule.name || rule.rule_id,
        enabled,
      lastRunAt: rule.last_run_at,
      lastRunStatus: rule.last_run_status,
    });
  });

  return (
    <AutomationPageClient
      user={user}
      repos={repos || []}
      connections={connections || []}
      allRules={allRules}
      stats={{
        totalRules,
        activeRules,
        executions24h: 0, // Will be calculated client-side from API
        successRate: 0,   // Will be calculated client-side from API
      }}
    />
  );
}

