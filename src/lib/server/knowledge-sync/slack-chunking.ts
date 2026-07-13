import {
  countWords,
  createKnowledgeTextChunk,
  DEFAULT_KNOWLEDGE_CHUNK_MAX_WORDS,
  type KnowledgeTextChunk,
} from '@/lib/server/knowledge-sync/text-chunker';
import type { SlackMessage } from '@/lib/server/knowledge-sync/slack-client';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export function chunkSlackMessages(
  messages: SlackMessage[],
  channelId: string,
  channelName: string
): KnowledgeTextChunk[] {
  const chunks: KnowledgeTextChunk[] = [];
  if (messages.length === 0) return chunks;

  let currentTexts: string[] = [];
  let currentWordCount = 0;
  let earliestTs = messages[0].ts;
  let latestTs = messages[0].ts;
  let lastTs = parseFloat(messages[0].ts) * 1000;

  const flushChunk = () => {
    if (currentTexts.length === 0) return;
    chunks.push(
      createKnowledgeTextChunk({
        content: currentTexts.join('\n\n'),
        metadata: {
          provider: 'slack',
          source_type: 'team_chat',
          channel_id: channelId,
          channel_name: channelName,
          earliest_ts: earliestTs,
          latest_ts: latestTs,
          external_id: `${channelId}:${earliestTs}:${latestTs}`,
          message_count: currentTexts.length,
        },
        identityParts: ['slack', channelId, earliestTs, latestTs, chunks.length],
      })
    );
    currentTexts = [];
    currentWordCount = 0;
  };

  for (const message of messages) {
    const messageTimeMs = parseFloat(message.ts) * 1000;
    const timeDelta = Math.abs(messageTimeMs - lastTs);

    if (timeDelta > TWO_HOURS_MS && currentTexts.length > 0) {
      flushChunk();
      earliestTs = message.ts;
    }

    const words = countWords(message.text);
    if (currentWordCount + words > DEFAULT_KNOWLEDGE_CHUNK_MAX_WORDS && currentTexts.length > 0) {
      flushChunk();
      earliestTs = message.ts;
    }

    currentTexts.push(message.text);
    currentWordCount += words;
    latestTs = message.ts;
    lastTs = messageTimeMs;
  }

  flushChunk();
  return chunks;
}
