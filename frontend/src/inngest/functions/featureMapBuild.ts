import { inngest } from '../client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { buildFeatureMapAndPersist } from '@/lib/server/services/featureMap';
import { createLogger } from '@/lib/server/logging';

const log = createLogger('feature_map', {
  label: 'Feature Map',
  eventLabels: {
    worker_start: 'Feature Map Worker Started',
    worker_complete: 'Feature Map Worker Completed',
    worker_error: 'Feature Map Worker Error',
  },
});

export const featureMapBuild = inngest.createFunction(
  {
    id: 'feature-map-build',
    name: 'Feature Map: Build and Persist',
    retries: 1,
    concurrency: { limit: 2 },
  },
  { event: 'feature_map.build' },
  async ({ event, step }) => {
    const userId = typeof event.data?.userId === 'string' ? event.data.userId : '';

    if (!userId) {
      return { error: 'Missing userId' };
    }

    log.info('worker_start', { userId });

    const supabase = createServiceRoleClient();

    const { data: sources, error } = await supabase
      .from('workspace_sources')
      .select('id, provider, scope')
      .eq('user_id', userId);

    if (error) {
      console.error('[feature_map.build] failed to load sources', error);
      log.error('worker_error', { userId, error: error.message });
      return { error: error.message };
    }

    if (!sources || sources.length === 0) {
      return { error: 'No sources found for feature map build' };
    }

    const result = await step.run('build-feature-map', async () => {
      return buildFeatureMapAndPersist({ supabase, userId, sources });
    });

    log.info('worker_complete', {
      userId,
      runHash: result.runHash,
      featureCount: result.features.length,
      sharedCount: result.shared.length,
    });

    return { runHash: result.runHash, features: result.features.length, shared: result.shared.length };
  }
);
