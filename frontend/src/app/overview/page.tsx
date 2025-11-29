import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { OverviewPageClient } from './page-client';

export default async function OverviewPage() {
  const { session, user } = await getSession();

  if (!session) {
    redirect('/login');
  }

  const supabase = await createClient();

  // Get all submissions with more details
  const { data: submissions, error: submissionsError } = await supabase
    .from('submissions')
    .select('id, created_at, status, last_checked_at, is_outdated, input_type')
    .order('created_at', { ascending: false });

  // Get total architecture diagrams with more details
  const { data: diagrams, error: diagramsError } = await supabase
    .from('architecture_diagrams')
    .select('id, created_at, last_updated_at, auto_update_enabled, title')
    .order('last_updated_at', { ascending: false });

  // Get architecture diagram versions (for regeneration count)
  const { data: versions, error: versionsError } = await supabase
    .from('architecture_diagram_versions')
    .select('id, created_at, diagram_id, version_number')
    .order('created_at', { ascending: false });

  // Get automation rules status
  const { data: repos, error: reposError } = await supabase
    .from('workspace_repos')
    .select('id, name, repo_url, settings')
    .order('created_at', { ascending: false });

  // Extract automation rules and their metadata
  const automationRules: Array<{
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

  repos?.forEach((repo) => {
    const settings = repo.settings || {};
    const rules = Array.isArray(settings.automation_rules) ? settings.automation_rules : [];
    const metadata = settings.automation_metadata || {};

    rules.forEach((rule: any) => {
      const ruleId = rule.id || rule.name || 'default';
      const ruleMetadata = metadata[ruleId] || {};
      
      automationRules.push({
        repoId: repo.id,
        repoName: repo.name || 'Untitled Repo',
        repoUrl: repo.repo_url || '',
        ruleId,
        ruleName: rule.name || ruleId,
        enabled: Boolean(rule.enabled),
        lastRunAt: ruleMetadata.last_run_at,
        lastRunStatus: ruleMetadata.last_run_status,
        lastExecution: ruleMetadata.last_execution,
      });
    });
  });

  // Calculate statistics
  const totalSubmissions = submissions?.length || 0;
  const completedSubmissions = submissions?.filter(s => s.status === 'completed').length || 0;
  const processingSubmissions = submissions?.filter(s => s.status === 'processing').length || 0;
  const failedSubmissions = submissions?.filter(s => s.status === 'failed').length || 0;
  const outdatedSubmissions = submissions?.filter(s => s.is_outdated).length || 0;
  
  const regeneratedCount = submissions?.filter((sub) => {
    if (!sub.last_checked_at || sub.status !== 'completed') return false;
    const created = new Date(sub.created_at);
    const checked = new Date(sub.last_checked_at);
    return checked.getTime() - created.getTime() > 60000; // More than 1 minute difference
  }).length || 0;

  // Calculate input type breakdown
  const inputTypeBreakdown: Record<string, number> = {};
  submissions?.forEach(sub => {
    const type = sub.input_type || 'unknown';
    inputTypeBreakdown[type] = (inputTypeBreakdown[type] || 0) + 1;
  });

  // Get recent activity (last 10 items)
  const recentSubmissions = submissions?.slice(0, 10) || [];
  const recentDiagrams = diagrams?.slice(0, 5) || [];

  const stats = {
    totalDocuments: completedSubmissions,
    totalSubmissions: totalSubmissions,
    processingDocuments: processingSubmissions,
    failedDocuments: failedSubmissions,
    outdatedDocuments: outdatedSubmissions,
    totalRegenerated: regeneratedCount,
    totalArchitectureDiagrams: diagrams?.length || 0,
    totalArchitectureVersions: versions?.length || 0,
    autoUpdateEnabled: diagrams?.filter(d => d.auto_update_enabled).length || 0,
    inputTypeBreakdown,
    rawData: {
      submissions: submissions?.map((sub) => ({
        created_at: sub.created_at,
        last_checked_at: sub.last_checked_at,
        status: sub.status,
        is_outdated: sub.is_outdated,
        input_type: sub.input_type,
      })) || [],
      diagrams: diagrams?.map((diag) => ({
        created_at: diag.created_at,
        last_updated_at: diag.last_updated_at,
        auto_update_enabled: diag.auto_update_enabled,
        title: diag.title,
      })) || [],
      versions: versions?.map((version) => ({
        created_at: version.created_at,
        version_number: version.version_number,
      })) || [],
    },
    recentActivity: {
      submissions: recentSubmissions.map(sub => ({
        id: sub.id,
        created_at: sub.created_at,
        status: sub.status,
        is_outdated: sub.is_outdated,
      })),
      diagrams: recentDiagrams.map(diag => ({
        id: diag.id,
        title: diag.title,
        last_updated_at: diag.last_updated_at,
      })),
    },
    errors: {
      submissions: submissionsError?.message,
      diagrams: diagramsError?.message,
      versions: versionsError?.message,
      repos: reposError?.message,
    },
    automationRules,
  };

  return (
    <OverviewPageClient
      user={user}
      stats={stats}
    />
  );
}

