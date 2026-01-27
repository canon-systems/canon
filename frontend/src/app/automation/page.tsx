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

  function stripOauthFromMetadata(metadata: unknown) {
    if (!metadata) return metadata;

    const strip = (obj: unknown): unknown => {
      if (!obj || typeof obj !== 'object') return obj;
      if ('oauth' in obj) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { oauth: _oauth, ...rest } = obj;
        return rest;
      }
      return obj;
    };

    if (typeof metadata === 'string') {
      try {
        const parsed = JSON.parse(metadata);
        return strip(parsed);
      } catch {
        return metadata;
      }
    }

    return strip(metadata);
  }

  // Get all repos (not just ones with automation rules)
  const { data: repos } = await supabase
    .from('workspace_sources')
    .select('id, name, repo_url, external_url, default_branch, provider, auth_type, created_at, updated_at')
    .order('created_at', { ascending: false });

  // Get connections for knowledge base providers
  const { data: connections } = await supabase
    .from('oauth_connections')
    .select('id, provider, connection_id, status, metadata, created_at, updated_at')
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  const safeConnections: Array<{
    id: string;
    provider: string;
    connection_id: string;
    status: string;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
  }> = (connections || []).map((connection: {
    id: string;
    provider: string;
    connection_id: string;
    status: string;
    metadata: unknown;
    created_at: string;
    updated_at: string;
  }) => {
    const cleanedMetadata = stripOauthFromMetadata(connection.metadata);
    const metadataRecord = (cleanedMetadata && typeof cleanedMetadata === 'object' && !Array.isArray(cleanedMetadata))
      ? cleanedMetadata as Record<string, unknown>
      : {};
    return {
      id: connection.id,
      provider: connection.provider,
      connection_id: connection.connection_id,
      status: connection.status,
      metadata: metadataRecord,
      created_at: connection.created_at,
      updated_at: connection.updated_at,
    };
  });

  // Get automation rules from the new table
  const { data: rules } = await supabase
    .from('automation_rules')
    .select(`
      *,
      workspace_sources!inner(id, name, repo_url, external_url)
    `)
    .eq('user_id', user.id);

  // Extract automation rules (stats will be calculated client-side from API)
  const allRules: Array<{
    sourceId: string;
    sourceName: string;
    sourceUrl: string;
    ruleId: string;
    ruleName: string;
    enabled: boolean;
    generate_doc?: boolean;
    generate_diagram?: boolean;
    auto_publish?: boolean;
    auto_approve?: boolean;
    schedule?: string;
    lastRunAt?: string;
    lastRunStatus?: string;
    lastExecution?: Record<string, unknown>;
    // Legacy fields kept for compatibility with UI until fully migrated
    repoId?: string;
    repoName?: string;
    repoUrl?: string;
  }> = [];

  let totalRules = 0;
  let activeRules = 0;

  rules?.forEach((rule: {
    id: string;
    source_id?: string;
    enabled?: boolean;
    name?: string;
    schedule?: string;
    generate_doc?: boolean;
    generate_diagram?: boolean;
    auto_publish?: boolean;
    auto_approve?: boolean;
    last_run_at?: string;
    last_run_status?: string;
    workspace_sources?: {
      id?: string;
      name?: string;
      repo_url?: string;
      external_url?: string;
    };
  }) => {
    const enabled = Boolean(rule.enabled);

    totalRules++;
    if (enabled) activeRules++;

    const workspaceSource = rule.workspace_sources;
    const sourceName = (workspaceSource && typeof workspaceSource === 'object' && 'name' in workspaceSource && typeof workspaceSource.name === 'string')
      ? workspaceSource.name
      : 'Untitled Source';
    const sourceUrl = (workspaceSource && typeof workspaceSource === 'object')
      ? ((typeof workspaceSource.external_url === 'string' ? workspaceSource.external_url : '') || 
         (typeof workspaceSource.repo_url === 'string' ? workspaceSource.repo_url : ''))
      : '';
    const sourceId = rule.source_id || (workspaceSource && typeof workspaceSource === 'object' && 'id' in workspaceSource && typeof workspaceSource.id === 'string' ? workspaceSource.id : rule.id);
    allRules.push({
      // new naming
      sourceId,
      sourceName,
      sourceUrl,
      // legacy fields kept for compatibility with UI until fully migrated
      repoId: sourceId,
      repoName: sourceName,
      repoUrl: sourceUrl,
      ruleId: rule.id,
      ruleName: rule.name || rule.id,
      enabled,
      generate_doc: rule.generate_doc,
      generate_diagram: rule.generate_diagram,
      auto_publish: rule.auto_publish,
      auto_approve: rule.auto_approve,
      schedule: rule.schedule,
      lastRunAt: rule.last_run_at,
      lastRunStatus: rule.last_run_status,
    });
  });

  return (
    <AutomationPageClient
      user={user}
      repos={repos || []}
      connections={safeConnections}
      allRules={allRules}
      stats={{
        totalRules,
        activeRules,
        executions: 0, // Will be calculated client-side from API
        successRate: 0,   // Will be calculated client-side from API
      }}
    />
  );
}
