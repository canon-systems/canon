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

  // Get all documents (replaced submissions)
  const { data: userRepos } = await supabase
    .from('workspace_repos')
    .select('id')
    .eq('workspace_id', user.id);

  const repoIds = userRepos?.map(r => r.id) || [];
  const { data: documents, error: documentsError } = repoIds.length > 0
    ? await supabase
      .from('documents')
      .select('id, created_at, updated_at')
      .in('repo_id', repoIds)
      .order('created_at', { ascending: false })
    : { data: null, error: null };

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
  const totalDocuments = documents?.length || 0;
  
  // Count regenerated documents (updated_at is significantly different from created_at)
  const regeneratedCount = documents?.filter((doc) => {
    if (!doc.updated_at) return false;
    const created = new Date(doc.created_at);
    const updated = new Date(doc.updated_at);
    // More than 1 minute difference indicates regeneration
    return updated.getTime() - created.getTime() > 60000;
  }).length || 0;

  // Get recent activity (last 10 items)
  const recentDocuments = documents?.slice(0, 10) || [];
  const recentDiagrams = diagrams?.slice(0, 5) || [];

  const stats = {
    totalDocuments: totalDocuments,
    totalSubmissions: totalDocuments, // Keep for backward compatibility with client
    processingDocuments: 0, // Documents don't have processing state
    failedDocuments: 0, // Documents don't have failed state
    outdatedDocuments: 0, // Documents don't have outdated state
    totalRegenerated: regeneratedCount,
    totalArchitectureDiagrams: diagrams?.length || 0,
    totalArchitectureVersions: versions?.length || 0,
    autoUpdateEnabled: diagrams?.filter(d => d.auto_update_enabled).length || 0,
    inputTypeBreakdown: {}, // Documents don't have input_type
    rawData: {
      submissions: documents?.map((doc) => ({
        created_at: doc.created_at,
        last_checked_at: doc.updated_at, // Use updated_at as proxy
        status: 'completed', // All documents are considered completed
        is_outdated: false, // Documents don't track outdated status
        input_type: null, // Documents don't have input_type
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
      submissions: recentDocuments.map(doc => ({
        id: doc.id,
        created_at: doc.created_at,
        status: 'completed', // All documents are considered completed
        is_outdated: false, // Documents don't track outdated status
      })),
      diagrams: recentDiagrams.map(diag => ({
        id: diag.id,
        title: diag.title,
        last_updated_at: diag.last_updated_at,
      })),
    },
    errors: {
      submissions: documentsError?.message,
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

