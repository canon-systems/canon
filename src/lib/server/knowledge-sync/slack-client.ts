import {
  SOURCE_SYNC_LOOKBACK_DAYS,
  SOURCE_SYNC_MESSAGE_ITEM_LIMIT,
  SOURCE_SYNC_MESSAGE_THREAD_REPLY_LIMIT,
} from '@/lib/knowledge/source-sync-policy';

export type SlackMessage = {
  ts: string;
  text: string;
  subtype?: string;
  reply_count?: number;
  user?: string;
  bot_id?: string;
  app_id?: string;
  username?: string;
  thread_ts?: string;
};

type SlackReply = {
  ts: string;
  text: string;
  subtype?: string;
  user?: string;
  bot_id?: string;
  app_id?: string;
  username?: string;
  thread_ts?: string;
};

type SlackHistoryResult = {
  messages: SlackMessage[];
  pagesFetched: number;
};

type SlackApiListResponse<T> = {
  ok: boolean;
  error?: string;
  needed?: string;
  provided?: string;
  messages?: T[];
  response_metadata?: { next_cursor?: string };
};

const timestampDaysAgo = (days: number) => Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000).toString();
const SLACK_THREAD_REPLY_CONCURRENCY = 5;
const MAX_SLACK_RETRY_ATTEMPTS = 3;
const REQUIRED_SLACK_HISTORY_SCOPES = ['channels:history', 'groups:history', 'mpim:history', 'im:history'];

export class SlackApiError extends Error {
  method: string;
  slackError: string;
  needed?: string;
  provided?: string;

  constructor(params: { method: string; error: string; needed?: string; provided?: string }) {
    super(`Slack ${params.method} failed: ${params.error}`);
    this.name = 'SlackApiError';
    this.method = params.method;
    this.slackError = params.error;
    this.needed = params.needed;
    this.provided = params.provided;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSlackJson<T>(url: string, botToken: string): Promise<T> {
  let attempt = 0;

  while (true) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${botToken}` },
    });

    if (res.status !== 429 || attempt >= MAX_SLACK_RETRY_ATTEMPTS) {
      return (await res.json()) as T;
    }

    attempt += 1;
    const retryAfterSeconds = Number(res.headers.get('retry-after') ?? '1');
    await sleep(Math.max(1, retryAfterSeconds) * 1000);
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );

  return results;
}

export function missingSlackHistoryScopes(scope: string | null | undefined): string[] {
  const provided = new Set(
    (scope || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  );

  return REQUIRED_SLACK_HISTORY_SCOPES.filter((scopeName) => !provided.has(scopeName));
}

export async function fetchSlackHistory(
  botToken: string,
  channelId: string,
  options?: { windowDays?: number; maxMessages?: number }
): Promise<SlackHistoryResult> {
  const messages: SlackMessage[] = [];
  let cursor: string | undefined;
  let pagesFetched = 0;
  const windowDays = Math.max(1, Math.min(365, Math.round(options?.windowDays ?? SOURCE_SYNC_LOOKBACK_DAYS)));
  const maxMessages = Math.max(1, Math.min(SOURCE_SYNC_MESSAGE_ITEM_LIMIT, Math.round(options?.maxMessages ?? SOURCE_SYNC_MESSAGE_ITEM_LIMIT)));
  const oldest = timestampDaysAgo(windowDays);

  while (messages.length < maxMessages) {
    const params = new URLSearchParams({
      channel: channelId,
      limit: '200',
      oldest,
    });
    if (cursor) params.set('cursor', cursor);

    const data = await fetchSlackJson<SlackApiListResponse<SlackMessage>>(
      `https://slack.com/api/conversations.history?${params}`,
      botToken
    );

    if (!data.ok) {
      throw new SlackApiError({
        method: 'conversations.history',
        error: data.error ?? 'unknown_error',
        needed: data.needed,
        provided: data.provided,
      });
    }

    if (!data.messages) break;
    pagesFetched++;
    messages.push(...data.messages);

    cursor = data.response_metadata?.next_cursor;
    if (!cursor) break;
  }

  return { messages: messages.slice(0, maxMessages), pagesFetched };
}

async function fetchSlackThreadReplies(botToken: string, channelId: string, ts: string): Promise<SlackReply[]> {
  const replies: SlackReply[] = [];
  let cursor: string | undefined;

  while (replies.length < SOURCE_SYNC_MESSAGE_THREAD_REPLY_LIMIT) {
    const params = new URLSearchParams({
      channel: channelId,
      ts,
      limit: '15',
    });
    if (cursor) params.set('cursor', cursor);

    const data = await fetchSlackJson<SlackApiListResponse<SlackReply>>(
      `https://slack.com/api/conversations.replies?${params}`,
      botToken
    );
    if (!data.ok) {
      throw new SlackApiError({
        method: 'conversations.replies',
        error: data.error ?? 'unknown_error',
        needed: data.needed,
        provided: data.provided,
      });
    }

    replies.push(...(data.messages ?? []).filter((message) => message.ts !== ts));
    cursor = data.response_metadata?.next_cursor;
    if (!cursor) break;
  }

  return replies.slice(0, SOURCE_SYNC_MESSAGE_THREAD_REPLY_LIMIT);
}

export async function enrichSlackMessagesWithReplies(params: {
  botToken: string;
  channelId: string;
  messages: SlackMessage[];
  minMessageLength: number;
}): Promise<SlackMessage[]> {
  const replyCandidates = params.messages.filter((message) => (message.reply_count ?? 0) > 0);
  const threadReplies = await mapWithConcurrency(
    replyCandidates,
    SLACK_THREAD_REPLY_CONCURRENCY,
    async (message) => {
      const replies = await fetchSlackThreadReplies(params.botToken, params.channelId, message.ts);
      const validReplies = replies.filter(
        (reply) => !reply.subtype && reply.text && reply.text.length >= params.minMessageLength
      );
      return [message.ts, validReplies.map((reply) => ({
        ts: reply.ts,
        text: reply.text,
        user: reply.user,
        bot_id: reply.bot_id,
        app_id: reply.app_id,
        username: reply.username,
        thread_ts: reply.thread_ts ?? message.ts,
      }))] as const;
    }
  );
  const repliesByThread = new Map(threadReplies);

  const enriched: SlackMessage[] = [];
  for (const message of params.messages) {
    enriched.push(message);
    enriched.push(...(repliesByThread.get(message.ts) ?? []));
  }

  return enriched;
}
