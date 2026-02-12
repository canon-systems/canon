import { inngest } from '../client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { runDiffBackfillForSource } from '@/lib/server/diff/backfill';

type BackfillRequestedEvent = {
  sourceId?: string;
  userId?: string;
  requestedDays?: number;
};

export const diffSourceBackfill = inngest.createFunction(
  {
    id: 'diff-source-backfill',
    name: 'Diff Source Backfill',
    retries: 1,
    concurrency: { limit: 1 },
  },
  { event: 'diff/source.backfill.requested' },
  async ({ event, step }) => {
    const data = (event.data ?? {}) as BackfillRequestedEvent;
    const sourceId = typeof data.sourceId === 'string' ? data.sourceId : '';
    const userId = typeof data.userId === 'string' ? data.userId : '';
    const requestedDays = typeof data.requestedDays === 'number' ? data.requestedDays : undefined;

    if (!sourceId || !userId) {
      return { error: 'Missing sourceId or userId' };
    }

    const supabase = createServiceRoleClient();
    const { data: source, error } = await supabase
      .from('workspace_sources')
      .select('id, user_id, provider, scope')
      .eq('id', sourceId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      return { error: error.message, sourceId, userId };
    }

    if (!source) {
      return { skipped: true, reason: 'source_not_found', sourceId, userId };
    }

    const sourceRow = source as { id: string; user_id: string; provider: string; scope: Record<string, unknown> | null };
    console.log('[diff/backfill] worker start', {
      sourceId: sourceRow.id,
      userId,
      provider: sourceRow.provider,
      requestedDays: requestedDays ?? null,
    });

    try {
      const result = await step.run('run-diff-backfill', async () =>
        runDiffBackfillForSource({
          supabase,
          source: sourceRow,
          requestedDays,
        })
      );

      console.log('[diff/backfill] worker done', result);
      return result;
    } catch (error) {
      console.error('[diff/backfill] worker failed', {
        sourceId: sourceRow.id,
        userId,
        provider: sourceRow.provider,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
);
