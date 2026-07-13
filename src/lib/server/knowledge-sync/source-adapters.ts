import { inngest } from '@/inngest/client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { errorMessage } from '@/lib/server/logging';
import {
  getGranolaConnectionForOrganization,
  getSlackAccessTokenForOrganization,
} from '@/lib/server/knowledge-sync/source-connections';
import {
  fetchEmbedPersistGranolaSource,
  type GranolaSyncStats,
} from '@/lib/server/knowledge-sync/granola-sync';
import {
  missingSlackHistoryScopes,
  SlackApiError,
} from '@/lib/server/knowledge-sync/slack-client';
import {
  fetchEmbedPersistSlackSource,
  NoSyncableContentError,
} from '@/lib/server/knowledge-sync/slack-sync';
import { SyncStoppedError } from '@/lib/server/knowledge-sync/errors';
import type { KnowledgeProvider } from '@/lib/server/knowledge-sync/source-repository';

type SupabaseServiceClient = ReturnType<typeof createServiceRoleClient>;

export type KnowledgeSourceRow = {
  id: string;
  organization_id: string;
  provider: string;
  name: string;
  slack_channel_id: string | null;
  slack_channel_name: string | null;
  status: string;
};

type KnowledgeSourceSyncLogger = {
  info(event: string, metadata?: Record<string, unknown>): void;
  warn(event: string, metadata?: Record<string, unknown>): void;
  error(event: string, metadata?: Record<string, unknown>): void;
};

type KnowledgeSourceSyncStep = {
  run(id: string, fn: () => Promise<unknown>): Promise<unknown>;
};

type KnowledgeSourceAdapterContext = {
  supabase: SupabaseServiceClient;
  source: KnowledgeSourceRow;
  sourceId: string;
  organizationId: string;
  syncStartedAt: number;
  step: KnowledgeSourceSyncStep;
  log: KnowledgeSourceSyncLogger;
  assertActive: (phase: string) => Promise<void>;
};

export type KnowledgeSourceAdapter = {
  provider: KnowledgeProvider;
  validate(source: KnowledgeSourceRow): { ok: true } | { ok: false; reason: string };
  sync(context: KnowledgeSourceAdapterContext): Promise<Record<string, unknown>>;
};

function elapsedMs(startedAt: number): number {
  return Date.now() - startedAt;
}

async function markSourceError(supabase: SupabaseServiceClient, sourceId: string) {
  await supabase
    .from('knowledge_sources')
    .update({ status: 'error', error_message: null })
    .eq('id', sourceId);
}

async function queueGranolaDownstreamWork(params: {
  organizationId: string;
  chunkCount: number;
}) {
  if (params.chunkCount === 0) return;

  const events: Array<{ name: string; data: Record<string, string> }> = [
    {
      name: 'onboarding/milestones.generate.requested',
      data: { organizationId: params.organizationId },
    },
  ];

  await inngest.send(events);
}

async function syncGranolaSource(context: KnowledgeSourceAdapterContext): Promise<Record<string, unknown>> {
  const { connectionId } = await getGranolaConnectionForOrganization(context.supabase, {
    organizationId: context.organizationId,
    log: context.log,
  });

  if (!connectionId) {
    context.log.error('sync_failed', {
      sourceId: context.sourceId,
      source: context.source.name,
      error: 'No active Granola Nango connection configured for organization',
      organizationId: context.organizationId,
      ms: elapsedMs(context.syncStartedAt),
    });
    await markSourceError(context.supabase, context.sourceId);
    return { ok: false, sourceId: context.sourceId, reason: 'missing_granola_connection' };
  }

  await context.supabase
    .from('knowledge_sources')
    .update({ status: 'syncing', error_message: null })
    .eq('id', context.sourceId);

  context.log.info('sync_start', {
    sourceId: context.sourceId,
    source: context.source.name,
    provider: 'granola',
    organizationId: context.organizationId,
    connectionId,
  });

  try {
    const {
      embeddedCount,
      noteCount,
      rawNoteCount,
      detailsFetched,
      transcriptItems,
      transcriptTextChars,
    } = await context.step.run('fetch-granola-notes-embed-insert', async () => {
      return fetchEmbedPersistGranolaSource({
        supabase: context.supabase,
        organizationId: context.organizationId,
        sourceId: context.sourceId,
        sourceName: context.source.name,
        connectionId,
        log: context.log,
        assertActive: context.assertActive,
      });
    }) as GranolaSyncStats;

    await context.assertActive('finalize granola');
    const emptySyncMessage = rawNoteCount === 0
      ? 'Granola returned no transcripts for this API key.'
      : noteCount === 0
        ? 'Granola returned meetings, but none had transcript text to index.'
        : null;
    await context.supabase.from('knowledge_sources').update({
      status: 'active',
      last_synced_at: new Date().toISOString(),
      chunk_count: embeddedCount,
      error_message: emptySyncMessage,
    }).eq('id', context.sourceId);

    await queueGranolaDownstreamWork({
      organizationId: context.organizationId,
      chunkCount: embeddedCount,
    });

    context.log.info('sync_complete', {
      sourceId: context.sourceId,
      source: context.source.name,
      provider: 'granola',
      rawNotesFetched: rawNoteCount,
      notesFetched: noteCount,
      detailsFetched,
      transcriptItems,
      transcriptTextChars,
      chunksEmbedded: embeddedCount,
      downstreamQueued: embeddedCount > 0,
      ms: elapsedMs(context.syncStartedAt),
    });
    return { ok: true, sourceId: context.sourceId, notesFetched: noteCount, chunksEmbedded: embeddedCount };
  } catch (error) {
    if (error instanceof SyncStoppedError) {
      context.log.info('sync_stopped', {
        sourceId: context.sourceId,
        source: context.source.name,
        provider: 'granola',
        phase: error.phase,
        ms: elapsedMs(context.syncStartedAt),
      });
      return { ok: true, sourceId: context.sourceId, stopped: true, phase: error.phase };
    }

    const msg = errorMessage(error);
    context.log.error('sync_failed', {
      sourceId: context.sourceId,
      source: context.source.name,
      provider: 'granola',
      error: msg,
      ms: elapsedMs(context.syncStartedAt),
    });
    await markSourceError(context.supabase, context.sourceId);
    throw error;
  }
}

async function syncSlackSource(context: KnowledgeSourceAdapterContext): Promise<Record<string, unknown>> {
  const { accessToken, connectionId, scope } = await getSlackAccessTokenForOrganization(
    context.supabase,
    context.organizationId
  );
  const channel = context.source.slack_channel_name || context.source.name;

  if (!accessToken) {
    context.log.error('sync_failed', {
      sourceId: context.sourceId,
      channel,
      error: 'No active source OAuth token configured for organization',
      organizationId: context.organizationId,
      connectionId,
      ms: elapsedMs(context.syncStartedAt),
    });
    await markSourceError(context.supabase, context.sourceId);
    return { ok: false, sourceId: context.sourceId, reason: 'missing_source_oauth_token' };
  }

  context.log.info('sync_token_resolved', {
    sourceId: context.sourceId,
    channel,
    organizationId: context.organizationId,
    connectionId,
  });

  const missingScopes = missingSlackHistoryScopes(scope);
  if (missingScopes.length > 0) {
    context.log.error('source_api_failed', {
      sourceId: context.sourceId,
      channel,
      method: 'scope_preflight',
      error: 'missing_scope',
      needed: missingScopes.join(','),
      provided: scope || 'none',
      ms: elapsedMs(context.syncStartedAt),
    });
    await markSourceError(context.supabase, context.sourceId);
    return {
      ok: false,
      sourceId: context.sourceId,
      reason: 'missing_source_history_scopes',
      needed: missingScopes,
      provided: scope || null,
    };
  }

  await context.supabase
    .from('knowledge_sources')
    .update({ status: 'syncing', error_message: null })
    .eq('id', context.sourceId);

  context.log.info('sync_start', {
    sourceId: context.sourceId,
    channel,
    channelId: context.source.slack_channel_id,
    organizationId: context.organizationId,
  });

  try {
    const { embeddedCount } = await context.step.run('fetch-embed-insert', async () => {
      return fetchEmbedPersistSlackSource({
        supabase: context.supabase,
        organizationId: context.organizationId,
        sourceId: context.sourceId,
        channelId: context.source.slack_channel_id!,
        channelName: channel,
        accessToken,
        log: context.log,
        assertActive: context.assertActive,
      });
    }) as { embeddedCount: number };

    await context.assertActive('finalize');
    await context.supabase.from('knowledge_sources').update({
      status: 'active',
      last_synced_at: new Date().toISOString(),
      chunk_count: embeddedCount,
      error_message: null,
    }).eq('id', context.sourceId);

    context.log.info('sync_complete', {
      sourceId: context.sourceId,
      channel,
      chunksEmbedded: embeddedCount,
      ms: elapsedMs(context.syncStartedAt),
    });
    return { ok: true, sourceId: context.sourceId, chunksEmbedded: embeddedCount };
  } catch (error) {
    if (error instanceof SyncStoppedError) {
      context.log.info('sync_stopped', {
        sourceId: context.sourceId,
        channel,
        phase: error.phase,
        ms: elapsedMs(context.syncStartedAt),
      });
      return { ok: true, sourceId: context.sourceId, stopped: true, phase: error.phase };
    }

    const msg = errorMessage(error);
    if (error instanceof NoSyncableContentError) {
      context.log.warn('sync_no_content', {
        sourceId: context.sourceId,
        channel,
        rawMessages: error.rawMessages,
        filteredMessages: error.filteredMessages,
        enrichedMessages: error.enrichedMessages,
        chunks: error.chunks,
        ms: elapsedMs(context.syncStartedAt),
      });
    }
    if (error instanceof SlackApiError) {
      context.log.error('source_api_failed', {
        sourceId: context.sourceId,
        channel,
        method: error.method,
        error: error.slackError,
        needed: error.needed,
        provided: error.provided,
        ms: elapsedMs(context.syncStartedAt),
      });
    }
    context.log.error('sync_failed', {
      sourceId: context.sourceId,
      channel,
      error: msg,
      ms: elapsedMs(context.syncStartedAt),
    });
    await markSourceError(context.supabase, context.sourceId);
    throw error;
  }
}

const sourceAdapters = {
  slack: {
    provider: 'slack',
    validate(source) {
      if (!source.slack_channel_id) return { ok: false, reason: 'missing_slack_channel_id' };
      return { ok: true };
    },
    sync: syncSlackSource,
  },
  granola: {
    provider: 'granola',
    validate() {
      return { ok: true };
    },
    sync: syncGranolaSource,
  },
} satisfies Partial<Record<KnowledgeProvider, KnowledgeSourceAdapter>>;

export function getKnowledgeSourceAdapter(provider: string): KnowledgeSourceAdapter | null {
  return provider in sourceAdapters ? sourceAdapters[provider as keyof typeof sourceAdapters] : null;
}
