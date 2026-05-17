import { inngest } from '../client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { embed } from 'ai';
import { embeddingModel } from '@/lib/ai';
import { createLogger, errorMessage } from '@/lib/server/logging';

type SlackKnowledgeSyncEvent = {
  sourceId?: string;
  organizationId?: string;
};

type SlackMessage = {
  ts: string;
  text: string;
  subtype?: string;
  reply_count?: number;
  user?: string;
};

type SlackReply = {
  ts: string;
  text: string;
  subtype?: string;
  user?: string;
};

const log = createLogger('inngest.slack_knowledge_sync', {
  label: 'Slack Knowledge Sync',
  eventLabels: {
    sync_start: 'Sync Started',
    sync_complete: 'Sync Completed',
    sync_failed: 'Sync Failed',
    sync_skipped: 'Sync Skipped',
  },
});

const NINETY_DAYS_AGO = () => Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000).toString();
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const MAX_MESSAGES = 1000;
const WORDS_PER_CHUNK = 400;
const MIN_MESSAGE_LENGTH = 20;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function fetchSlackHistory(botToken: string, channelId: string): Promise<SlackMessage[]> {
  const messages: SlackMessage[] = [];
  let cursor: string | undefined;
  const oldest = NINETY_DAYS_AGO();

  while (messages.length < MAX_MESSAGES) {
    const params = new URLSearchParams({
      channel: channelId,
      limit: '200',
      oldest,
    });
    if (cursor) params.set('cursor', cursor);

    const res = await fetch(`https://slack.com/api/conversations.history?${params}`, {
      headers: { Authorization: `Bearer ${botToken}` },
    });
    const data = (await res.json()) as { ok: boolean; messages?: SlackMessage[]; response_metadata?: { next_cursor?: string } };

    if (!data.ok || !data.messages) break;
    messages.push(...data.messages);

    cursor = data.response_metadata?.next_cursor;
    if (!cursor) break;
  }

  return messages.slice(0, MAX_MESSAGES);
}

async function fetchThreadReplies(botToken: string, channelId: string, ts: string): Promise<SlackReply[]> {
  const res = await fetch(
    `https://slack.com/api/conversations.replies?channel=${channelId}&ts=${ts}&limit=4`,
    { headers: { Authorization: `Bearer ${botToken}` } }
  );
  const data = (await res.json()) as { ok: boolean; messages?: SlackReply[] };
  if (!data.ok || !data.messages) return [];
  return data.messages.slice(1, 4); // skip root message, take top 3 replies
}

function chunkMessages(messages: SlackMessage[], channelId: string, channelName: string): Array<{
  content: string;
  metadata: { channel_id: string; channel_name: string; earliest_ts: string; latest_ts: string; message_count: number };
}> {
  const chunks: ReturnType<typeof chunkMessages> = [];
  if (messages.length === 0) return chunks;

  let currentTexts: string[] = [];
  let currentWordCount = 0;
  let earliestTs = messages[0].ts;
  let latestTs = messages[0].ts;
  let lastTs = parseFloat(messages[0].ts) * 1000;

  const flushChunk = () => {
    if (currentTexts.length === 0) return;
    chunks.push({
      content: currentTexts.join('\n\n'),
      metadata: { channel_id: channelId, channel_name: channelName, earliest_ts: earliestTs, latest_ts: latestTs, message_count: currentTexts.length },
    });
    currentTexts = [];
    currentWordCount = 0;
  };

  for (const msg of messages) {
    const msgTimeMs = parseFloat(msg.ts) * 1000;
    const timeDelta = Math.abs(msgTimeMs - lastTs);

    if (timeDelta > TWO_HOURS_MS && currentTexts.length > 0) {
      flushChunk();
      earliestTs = msg.ts;
    }

    const words = wordCount(msg.text);
    if (currentWordCount + words > WORDS_PER_CHUNK && currentTexts.length > 0) {
      flushChunk();
      earliestTs = msg.ts;
    }

    currentTexts.push(msg.text);
    currentWordCount += words;
    latestTs = msg.ts;
    lastTs = msgTimeMs;
  }

  flushChunk();
  return chunks;
}

export const slackKnowledgeSync = inngest.createFunction(
  {
    id: 'slack-knowledge-sync',
    name: 'Canon: Slack Knowledge Sync',
    retries: 2,
    idempotency: 'event.data.sourceId',
  },
  { event: 'onboarding/knowledge.sync.requested' },
  async ({ event, step }) => {
    const data = (event.data ?? {}) as SlackKnowledgeSyncEvent;
    const sourceId = typeof data.sourceId === 'string' ? data.sourceId : '';
    const organizationId = typeof data.organizationId === 'string' ? data.organizationId : '';

    if (!sourceId || !organizationId) {
      throw new Error('Missing sourceId or organizationId in event payload');
    }

    const supabase = createServiceRoleClient();

    const { data: source, error: sourceError } = await supabase
      .from('knowledge_sources')
      .select('id, organization_id, provider, name, slack_channel_id, slack_channel_name')
      .eq('id', sourceId)
      .single();

    if (sourceError || !source) {
      log.info('sync_skipped', { sourceId, reason: 'source_not_found' });
      return { skipped: true, reason: 'source_not_found' };
    }

    if (source.provider !== 'slack' || !source.slack_channel_id) {
      log.info('sync_skipped', { sourceId, reason: 'not_slack_source' });
      return { skipped: true, reason: 'not_slack_source' };
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('slack_bot_token')
      .eq('id', organizationId)
      .single();

    if (!org?.slack_bot_token) {
      await supabase.from('knowledge_sources').update({ status: 'error', error_message: 'No bot token configured' }).eq('id', sourceId);
      throw new Error('No Slack bot token for organization');
    }

    await supabase.from('knowledge_sources').update({ status: 'syncing', error_message: null }).eq('id', sourceId);

    log.info('sync_start', { sourceId, channelId: source.slack_channel_id, organizationId });

    try {
      const { embeddedCount } = await step.run('fetch-embed-insert', async () => {
        const rawMessages = await fetchSlackHistory(org.slack_bot_token!, source.slack_channel_id!);

        const filtered = rawMessages.filter(
          (m) => !m.subtype && m.text && m.text.length >= MIN_MESSAGE_LENGTH
        );

        const enriched: SlackMessage[] = [];
        for (const msg of filtered) {
          enriched.push(msg);
          if (msg.reply_count && msg.reply_count > 0) {
            const replies = await fetchThreadReplies(org.slack_bot_token!, source.slack_channel_id!, msg.ts);
            const validReplies = replies.filter((r) => !r.subtype && r.text && r.text.length >= MIN_MESSAGE_LENGTH);
            enriched.push(...validReplies.map((r) => ({ ts: r.ts, text: r.text, user: r.user })));
          }
        }

        const chunks = chunkMessages(enriched, source.slack_channel_id!, source.slack_channel_name || '');

        await supabase.from('knowledge_chunks').delete().eq('source_id', sourceId);

        let inserted = 0;
        for (const chunk of chunks) {
          const { embedding } = await embed({ model: embeddingModel, value: chunk.content });
          await supabase.from('knowledge_chunks').insert({
            organization_id: organizationId,
            source_id: sourceId,
            content: chunk.content,
            metadata: chunk.metadata,
            embedding: JSON.stringify(embedding),
          });
          inserted++;
        }

        return { embeddedCount: inserted };
      });

      await supabase.from('knowledge_sources').update({
        status: 'active',
        last_synced_at: new Date().toISOString(),
        chunk_count: embeddedCount,
        error_message: null,
      }).eq('id', sourceId);

      log.info('sync_complete', { sourceId, chunksEmbedded: embeddedCount });
      return { ok: true, sourceId, chunksEmbedded: embeddedCount };
    } catch (error) {
      const msg = errorMessage(error);
      log.error('sync_failed', { sourceId, error: msg });
      await supabase.from('knowledge_sources').update({ status: 'error', error_message: msg }).eq('id', sourceId);
      throw error;
    }
  }
);
