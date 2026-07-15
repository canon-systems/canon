import type { SupabaseClient } from '@supabase/supabase-js';
import { getProviderAccessToken } from '@/lib/server/oauth/tokenStore';

type SlackApiResponse = {
  ok?: boolean;
  error?: string;
};

export type SlackPostMessageResult = {
  ok: boolean;
  channel?: string;
  ts?: string;
  permalink?: string | null;
  error?: string;
};

export async function getSlackBotTokenForOrganization(params: {
  supabase: SupabaseClient;
  organizationId: string;
}) {
  const { data: slackConnection } = await params.supabase
    .from('oauth_connections')
    .select('connection_id')
    .eq('organization_id', params.organizationId)
    .eq('provider', 'slack')
    .eq('status', 'active')
    .maybeSingle();

  if (!slackConnection) return null;
  return getProviderAccessToken({ provider: 'slack', connectionId: slackConnection.connection_id });
}

async function slackPost<T extends SlackApiResponse>(params: {
  botToken: string;
  method: string;
  body: Record<string, unknown>;
}): Promise<T> {
  const res = await fetch(`https://slack.com/api/${params.method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.botToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(params.body),
  });

  return (await res.json().catch(() => ({
    ok: false,
    error: 'invalid_slack_response',
  }))) as T;
}

async function openSlackDm(params: {
  botToken: string;
  slackUserId: string;
}): Promise<{ ok: boolean; channelId?: string; error?: string }> {
  const data = await slackPost<SlackApiResponse & { channel?: { id?: string } }>({
    botToken: params.botToken,
    method: 'conversations.open',
    body: { users: params.slackUserId },
  });

  if (!data.ok || !data.channel?.id) {
    return { ok: false, error: data.error ?? 'conversations_open_failed' };
  }

  return { ok: true, channelId: data.channel.id };
}

export async function postSlackMessage(params: {
  botToken: string;
  channel: string;
  text: string;
  blocks?: unknown[];
  threadTs?: string | null;
}): Promise<SlackPostMessageResult> {
  const data = await slackPost<SlackApiResponse & { channel?: string; ts?: string }>({
    botToken: params.botToken,
    method: 'chat.postMessage',
    body: {
      channel: params.channel,
      text: params.text,
      ...(params.blocks ? { blocks: params.blocks } : {}),
      ...(params.threadTs ? { thread_ts: params.threadTs } : {}),
      unfurl_links: false,
      unfurl_media: false,
    },
  });

  if (!data.ok) return { ok: false, error: data.error ?? 'chat_post_message_failed' };

  const channel = data.channel ?? params.channel;
  const permalink = data.ts
    ? await getSlackPermalink({ botToken: params.botToken, channel, ts: data.ts })
    : null;

  return { ok: true, channel, ts: data.ts, permalink };
}

export async function postSlackDm(params: {
  botToken: string;
  slackUserId: string;
  text: string;
  blocks?: unknown[];
}): Promise<SlackPostMessageResult> {
  const dm = await openSlackDm({ botToken: params.botToken, slackUserId: params.slackUserId });
  if (!dm.ok || !dm.channelId) return { ok: false, error: dm.error ?? 'conversations_open_failed' };
  return postSlackMessage({
    botToken: params.botToken,
    channel: dm.channelId,
    text: params.text,
    blocks: params.blocks,
  });
}

async function getSlackPermalink(params: {
  botToken: string;
  channel: string;
  ts: string;
}) {
  const url = new URL('https://slack.com/api/chat.getPermalink');
  url.searchParams.set('channel', params.channel);
  url.searchParams.set('message_ts', params.ts);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${params.botToken}` },
  });
  const payload = (await response.json().catch(() => ({}))) as SlackApiResponse & { permalink?: string };
  return payload.ok && typeof payload.permalink === 'string' ? payload.permalink : null;
}
