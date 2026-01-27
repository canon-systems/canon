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

  const { data: usageEvents, error: usageEventsError } = await supabase
    .from('usage_events')
    .select('id, event_type, metadata, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });


  const { data: rulesData, error: reposError } = await supabase
    .from('automation_rules')
    .select(`
      *,
      workspace_sources!inner(id, name, repo_url, external_url, provider)
    `)
    .eq('user_id', user.id);

  // Extract automation rules
  const automationRules: Array<{
    repoId: string;
    repoName: string;
    repoUrl: string;
    ruleId: string;
    ruleName: string;
    enabled: boolean;
    lastRunAt?: string;
    lastRunStatus?: string;
    lastExecution?: Record<string, unknown>;
  }> = [];

  rulesData?.forEach((rule: {
    source_id: string;
    id: string;
    name?: string;
    enabled?: boolean;
    generate_doc?: boolean;
    generate_diagram?: boolean;
    auto_publish?: boolean;
    schedule?: string;
    last_run_at?: string;
    last_run_status?: string;
    workspace_sources?: {
      id?: string;
      name?: string;
      repo_url?: string;
      external_url?: string;
      provider?: string;
    };
  }) => {
    const workspaceSource = rule.workspace_sources;
    const sourceName = (workspaceSource && typeof workspaceSource === 'object' && 'name' in workspaceSource && typeof workspaceSource.name === 'string')
      ? workspaceSource.name
      : 'Untitled Source';
    const repoUrl = (workspaceSource && typeof workspaceSource === 'object')
      ? ((typeof workspaceSource.repo_url === 'string' ? workspaceSource.repo_url : '') || 
         (typeof workspaceSource.external_url === 'string' ? workspaceSource.external_url : ''))
      : '';
    
    automationRules.push({
      repoId: rule.source_id,
      repoName: sourceName,
      repoUrl,
      ruleId: rule.id,
      ruleName: rule.name || rule.id,
      enabled: Boolean(rule.enabled),
      lastRunAt: rule.last_run_at,
      lastRunStatus: rule.last_run_status,
    });
  });

  const events = usageEvents ?? [];

  const docGeneratedEvents = events.filter((event) => event.event_type === 'doc_generated');
  const docAutoPublishedEvents = events.filter((event) => event.event_type === 'doc_auto_published');
  const diagramGeneratedEvents = events.filter((event) => event.event_type === 'architecture_diagram_generated');
  const diagramRegeneratedEvents = events.filter((event) => event.event_type === 'architecture_diagram_regenerated');

  const getMetadataId = (event: (typeof events)[number], key: string) => {
    const metadata = event.metadata as Record<string, unknown> | null;
    const value = metadata?.[key];
    return typeof value === 'string' ? value : null;
  };

  const totalDocuments = docGeneratedEvents.length;
  const totalArchitectureDiagrams = diagramGeneratedEvents.length;

  const repoConnectionState = new Map<string, { connected: boolean; timestamp: number }>();
  events.forEach((event) => {
    if (event.event_type !== 'repo_connected' && event.event_type !== 'repo_disconnected') return;
    const repoId = getMetadataId(event, 'source_id') || getMetadataId(event, 'repo_id');
    if (!repoId) return;
    const timestamp = new Date(event.created_at).getTime();
    const existing = repoConnectionState.get(repoId);
    if (!existing || timestamp > existing.timestamp) {
      repoConnectionState.set(repoId, {
        connected: event.event_type === 'repo_connected',
        timestamp,
      });
    }
  });

  const connectedReposCount = Array.from(repoConnectionState.values()).filter((entry) => entry.connected).length;

  const stats = {
    totalDocuments,
    totalSubmissions: totalDocuments, // Keep for backward compatibility with client
    processingDocuments: 0,
    failedDocuments: 0,
    outdatedDocuments: 0,
    totalRegenerated: docAutoPublishedEvents.length,
    autoUpdateEnabled: 0,
    totalArchitectureDiagrams,
    totalArchitectureRegenerated: diagramRegeneratedEvents.length,
    usageEvents: events,
    recentActivity: {
      events: events.slice(0, 10),
    },
    errors: {
      usageEvents: usageEventsError?.message,
      repos: reposError?.message,
    },
    automationRules,
    connectedReposCount,
  };

  return (
    <OverviewPageClient
      stats={stats}
    />
  );
}
