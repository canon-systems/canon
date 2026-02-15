import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { computeDiffComparison, type CompareResponse, type WorkspaceSourceRow } from '@/lib/server/diff/compare';
import { createClient } from '@/lib/supabase/server';
import HistoryPageClient from './page-client';

function windowLast7DaysUtc(now: Date = new Date()): { start: string; end: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  start.setUTCHours(0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

export default async function HistoryPage() {
  const { session, user } = await getSession();

  if (!session || !user) {
    redirect('/login');
  }

  const supabase = await createClient();
  const { data: sourceRows, error } = await supabase
    .from('workspace_sources')
    .select('id, name, provider, scope')
    .eq('user_id', user.id)
    .in('provider', ['github', 'jira'])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load sources for history:', error);
  }

  const resolvedSourceRows = (sourceRows || []) as WorkspaceSourceRow[];
  const sources = resolvedSourceRows.map((source) => ({
    id: source.id,
    name: source.name,
    provider: source.provider,
  }));

  let initialData: CompareResponse | null = null;
  let initialError: string | null = null;
  let initialLastUpdatedAt: string | null = null;

  if (resolvedSourceRows.length > 0) {
    const window = windowLast7DaysUtc(new Date());
    try {
      initialData = await computeDiffComparison({
        userId: user.id,
        sourceIds: resolvedSourceRows.map((source) => source.id),
        startTimestamp: window.start,
        endTimestamp: window.end,
        sourceRows: resolvedSourceRows,
      });
      initialLastUpdatedAt = new Date().toISOString();
    } catch (compareError) {
      console.error('Failed to load compare data for history:', compareError);
      initialError = compareError instanceof Error ? compareError.message : 'Failed to load Canon History';
    }
  }

  return (
    <HistoryPageClient
      sources={sources}
      initialData={initialData}
      initialError={initialError}
      initialLastUpdatedAt={initialLastUpdatedAt}
    />
  );
}
