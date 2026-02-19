import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { computeDiffComparison, type CompareResponse, type WorkspaceSourceRow } from '@/lib/server/diff/compare';
import { computeBaselineWindow } from '@/lib/server/diff/contracts';
import { DIFF_SOURCE_PROVIDERS } from '@/lib/server/sources/providers';
import { getNormalizedWindowForDays, normalizeWindowDays } from '@/lib/server/signals/window';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceSignalSettings } from '@/lib/server/signals/settings';
import HistoryPageClient from './page-client';

export default async function HistoryPage() {
  const { session, user } = await getSession();

  if (!session || !user) {
    redirect('/login');
  }

  const supabase = await createClient();
  const settings = await getWorkspaceSignalSettings({ supabase, userId: user.id });
  const windowDays = Math.min(30, normalizeWindowDays(settings.baseline_window_days, 7));

  const { data: sourceRows, error } = await supabase
    .from('workspace_sources')
    .select('id, name, provider, scope')
    .eq('user_id', user.id)
    .in('provider', [...DIFF_SOURCE_PROVIDERS])
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
  const primaryWindow = getNormalizedWindowForDays(windowDays, new Date(), 7);
  const baselineWindow = computeBaselineWindow(primaryWindow.start, primaryWindow.end);

  if (resolvedSourceRows.length > 0) {
    try {
      initialData = await computeDiffComparison({
        userId: user.id,
        sourceIds: resolvedSourceRows.map((source) => source.id),
        startTimestamp: primaryWindow.start,
        endTimestamp: primaryWindow.end,
        compareStartTimestamp: baselineWindow.start,
        compareEndTimestamp: baselineWindow.end,
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
      windowDays={windowDays}
      primaryWindow={primaryWindow}
      baselineWindow={baselineWindow}
    />
  );
}
