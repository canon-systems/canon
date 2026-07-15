import { inngest } from '../client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/server/logging';
import { isScheduledKnowledgeSourceSyncable, scheduledSyncProviders } from '@/lib/server/knowledge-sync/scheduled-sources';

type ScheduledKnowledgeSource = {
  id: string;
  organization_id: string;
  provider: string;
  name: string | null;
  slack_channel_id: string | null;
  slack_channel_name: string | null;
  status: string;
};

const log = createLogger('inngest.knowledge_source_scheduled_sync', {
  label: 'Knowledge Source Scheduled Sync',
  eventLabels: {
    scheduled_sync_start: 'Scheduled Sync Started',
    scheduled_sync_complete: 'Scheduled Sync Completed',
    scheduled_sync_skipped: 'Scheduled Sync Skipped',
    scheduled_sync_queue_failed: 'Scheduled Sync Queue Failed',
  },
  componentColor: 'orange',
});

export const knowledgeSourceScheduledSync = inngest.createFunction(
  {
    id: 'knowledge-source-scheduled-sync',
    name: 'Canon: Queue Daily Knowledge Source Syncs',
    retries: 1,
  },
  { cron: '0 0 * * *' },
  async ({ step }) => {
    const supabase = createServiceRoleClient();
    const startedAt = Date.now();

    log.info('scheduled_sync_start', { cadence: 'daily', time: '00:00 UTC' });

    const sources = await step.run('load-active-sources', async () => {
      const { data, error } = await supabase
        .from('knowledge_sources')
        .select('id, organization_id, provider, name, slack_channel_id, slack_channel_name, status')
        .in('provider', [...scheduledSyncProviders])
        .eq('status', 'active');

      if (error) throw error;
      return ((data ?? []) as ScheduledKnowledgeSource[]).filter(isScheduledKnowledgeSourceSyncable);
    });

    if (sources.length === 0) {
      log.info('scheduled_sync_skipped', { reason: 'no_active_sources' });
      return { ok: true, queued: 0 };
    }

    try {
      await step.sendEvent(
        'queue-active-source-syncs',
        sources.map((source) => ({
          name: 'onboarding/knowledge.sync.requested',
          data: {
            sourceId: source.id,
            organizationId: source.organization_id,
            reason: 'daily_scheduled_sync',
          },
        }))
      );
    } catch (error) {
      log.error('scheduled_sync_queue_failed', {
        sourceCount: sources.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    log.info('scheduled_sync_complete', {
      queued: sources.length,
      sourceIds: sources.map((source) => source.id).join(','),
      ms: Date.now() - startedAt,
    });

    return { ok: true, queued: sources.length };
  }
);
