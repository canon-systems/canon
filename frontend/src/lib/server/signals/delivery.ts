import type { SupabaseClient } from '@supabase/supabase-js';
import { getProviderAccessToken } from '@/lib/server/oauth/tokenStore';
import { createLogger } from '@/lib/server/logging';
import { createServiceRoleClient } from '@/lib/supabase/server';

const log = createLogger('signals.delivery', {
  label: 'Signal Delivery',
  eventLabels: {
    slack_connection_missing: 'Slack Connection Missing',
    slack_scope_missing: 'Slack Scope Missing',
    slack_token_missing: 'Slack Token Missing',
    slack_channel_send_start: 'Slack Channel Send Start',
    slack_channel_send_success: 'Slack Channel Send Success',
    slack_channel_send_failed: 'Slack Channel Send Failed',
    slack_dm_open_start: 'Slack DM Open Start',
    slack_dm_open_success: 'Slack DM Open Success',
    slack_dm_open_failed: 'Slack DM Open Failed',
    slack_dm_channel_direct: 'Slack DM Channel Direct',
    slack_dm_target_missing: 'Slack DM Target Missing',
  },
});

type SlackConnection = {
  connectionId: string;
  scope: string | null;
};

export type SlackDeliveryResult = {
  sent: boolean;
  reason?: string;
  channel?: string;
  ts?: string;
  permalink?: string;
};

type SlackPostMessageResponse = {
  ok?: boolean;
  error?: string;
  channel?: string;
  ts?: string;
};

type SlackPermalinkResponse = {
  ok?: boolean;
  error?: string;
  permalink?: string;
};

function providedScopes(scope: string | null | undefined) {
  return new Set(
    (scope || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

function missingScopes(scope: string | null | undefined, requiredScopes: string[]) {
  const provided = providedScopes(scope);
  return requiredScopes.filter((scopeName) => !provided.has(scopeName));
}

function reconnectReason(missing: string[]) {
  return `Slack connection missing required scope${missing.length === 1 ? '' : 's'} ${missing.join(', ')}. Reconnect Slack to grant the updated permissions.`;
}

const NO_ACTIVE_SLACK_CONNECTION_REASON = 'No active Slack connection. Reconnect Slack before sending readiness briefs.';

async function slackPermalink(params: {
  accessToken: string;
  channel: string;
  ts: string;
}) {
  const url = new URL('https://slack.com/api/chat.getPermalink');
  url.searchParams.set('channel', params.channel);
  url.searchParams.set('message_ts', params.ts);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${params.accessToken}` },
  });
  const payload = (await response.json().catch(() => ({}))) as SlackPermalinkResponse;
  return payload.ok && typeof payload.permalink === 'string' ? payload.permalink : undefined;
}

async function resolveSlackConnection(params: {
  userId: string;
}): Promise<SlackConnection | null> {
  const { userId } = params;
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('oauth_connections')
    .select('connection_id')
    .eq('user_id', userId)
    .eq('provider', 'slack')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    log.warn('slack_connection_missing', {
      userId,
      reason: error.message,
      code: error.code,
    });
    return null;
  }

  const connectionId = data?.connection_id;
  if (typeof connectionId !== 'string' || connectionId.length === 0) return null;

  const { data: tokenRow, error: tokenError } = await supabase
    .from('oauth_provider_tokens')
    .select('scope')
    .eq('provider', 'slack')
    .eq('connection_id', connectionId)
    .maybeSingle();

  if (tokenError) {
    log.warn('slack_token_missing', {
      userId,
      connectionId,
      reason: tokenError.message,
      code: tokenError.code,
    });
  }

  return {
    connectionId,
    scope: typeof tokenRow?.scope === 'string' ? tokenRow.scope : null,
  };
}

export async function sendSlackMessage(params: {
  supabase: SupabaseClient;
  userId: string;
  channel: string | null;
  text: string;
}): Promise<SlackDeliveryResult> {
  const { userId, channel, text } = params;

  const normalizedChannel = typeof channel === 'string' ? channel.trim() : '';
  if (!normalizedChannel) {
    log.warn('slack_channel_send_failed', { reason: 'no_channel_configured' });
    return { sent: false, reason: 'No Slack channel configured.' };
  }
  const slackChannel = normalizedChannel.startsWith('#') ? normalizedChannel.slice(1) : normalizedChannel;
  if (!slackChannel) {
    log.warn('slack_channel_send_failed', { reason: 'no_channel_configured' });
    return { sent: false, reason: 'No Slack channel configured.' };
  }

  const connection = await resolveSlackConnection({ userId });
  if (!connection) {
    log.warn('slack_connection_missing', { userId, targetType: 'channel', channel: slackChannel });
    return { sent: false, reason: NO_ACTIVE_SLACK_CONNECTION_REASON };
  }

  const requiredScopes = ['chat:write'];
  const missing = missingScopes(connection.scope, requiredScopes);
  if (missing.length > 0) {
    const reason = reconnectReason(missing);
    log.warn('slack_scope_missing', {
      userId,
      connectionId: connection.connectionId,
      targetType: 'channel',
      channel: slackChannel,
      missingScopes: missing,
      providedScopes: connection.scope || 'none',
    });
    return { sent: false, reason };
  }

  const accessToken = await getProviderAccessToken({ provider: 'slack', connectionId: connection.connectionId });
  if (!accessToken) {
    log.warn('slack_token_missing', { userId, connectionId: connection.connectionId, targetType: 'channel', channel: slackChannel });
    return { sent: false, reason: 'No Slack access token available.' };
  }

  log.info('slack_channel_send_start', {
    userId,
    connectionId: connection.connectionId,
    channel: slackChannel,
    textLength: text.length,
  });

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      channel: slackChannel,
      text,
      mrkdwn: true,
      unfurl_links: false,
      unfurl_media: false,
    }),
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => 'Slack API request failed');
    log.warn('slack_channel_send_failed', {
      userId,
      connectionId: connection.connectionId,
      channel: slackChannel,
      status: response.status,
      reason: payload,
    });
    return { sent: false, reason: payload };
  }

  const payload = (await response.json().catch(() => ({}))) as SlackPostMessageResponse;
  if (!payload.ok) {
    log.warn('slack_channel_send_failed', {
      userId,
      connectionId: connection.connectionId,
      channel: slackChannel,
      reason: payload.error || 'ok_false',
    });
    return { sent: false, reason: payload.error || 'Slack API returned ok=false' };
  }

  const deliveredChannel = payload.channel || slackChannel;
  const permalink = payload.ts
    ? await slackPermalink({ accessToken, channel: deliveredChannel, ts: payload.ts })
    : undefined;

  log.info('slack_channel_send_success', {
    userId,
    connectionId: connection.connectionId,
    channel: deliveredChannel,
    ts: payload.ts,
    permalink,
  });

  return {
    sent: true,
    channel: deliveredChannel,
    ts: payload.ts,
    permalink,
  };
}

export async function sendSlackDirectMessage(params: {
  supabase: SupabaseClient;
  userId: string;
  slackUserId: string | null;
  text: string;
}): Promise<SlackDeliveryResult> {
  const { supabase, userId, slackUserId, text } = params;

  const normalizedUserId = typeof slackUserId === 'string' ? slackUserId.trim() : '';
  if (!normalizedUserId) {
    log.warn('slack_dm_target_missing', { userId });
    return { sent: false, reason: 'No Slack user configured.' };
  }

  if (normalizedUserId.startsWith('D')) {
    log.info('slack_dm_channel_direct', {
      userId,
      dmChannel: normalizedUserId,
    });
    return sendSlackMessage({
      supabase,
      userId,
      channel: normalizedUserId,
      text,
    });
  }

  const connection = await resolveSlackConnection({ userId });
  if (!connection) {
    log.warn('slack_connection_missing', { userId, targetType: 'dm', slackUserId: normalizedUserId });
    return { sent: false, reason: NO_ACTIVE_SLACK_CONNECTION_REASON };
  }

  const requiredScopes = ['im:write', 'chat:write'];
  const missing = missingScopes(connection.scope, requiredScopes);
  if (missing.length > 0) {
    const reason = reconnectReason(missing);
    log.warn('slack_scope_missing', {
      userId,
      connectionId: connection.connectionId,
      targetType: 'dm',
      slackUserId: normalizedUserId,
      missingScopes: missing,
      providedScopes: connection.scope || 'none',
    });
    return { sent: false, reason };
  }

  const accessToken = await getProviderAccessToken({ provider: 'slack', connectionId: connection.connectionId });
  if (!accessToken) {
    log.warn('slack_token_missing', { userId, connectionId: connection.connectionId, targetType: 'dm', slackUserId: normalizedUserId });
    return { sent: false, reason: 'No Slack access token available.' };
  }

  log.info('slack_dm_open_start', {
    userId,
    connectionId: connection.connectionId,
    slackUserId: normalizedUserId,
  });

  const openResponse = await fetch('https://slack.com/api/conversations.open', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ users: normalizedUserId }),
  });

  if (!openResponse.ok) {
    const payload = await openResponse.text().catch(() => 'Slack API request failed');
    log.warn('slack_dm_open_failed', {
      userId,
      connectionId: connection.connectionId,
      slackUserId: normalizedUserId,
      status: openResponse.status,
      reason: payload,
    });
    return { sent: false, reason: payload };
  }

  const openPayload = (await openResponse.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    channel?: { id?: string };
  };
  if (!openPayload.ok || !openPayload.channel?.id) {
    log.warn('slack_dm_open_failed', {
      userId,
      connectionId: connection.connectionId,
      slackUserId: normalizedUserId,
      reason: openPayload.error || 'missing_dm_channel_id',
    });
    return { sent: false, reason: openPayload.error || 'Slack failed to open DM.' };
  }

  log.info('slack_dm_open_success', {
    userId,
    connectionId: connection.connectionId,
    slackUserId: normalizedUserId,
    dmChannel: openPayload.channel.id,
  });

  const sent = await sendSlackMessage({
    supabase,
    userId,
    channel: openPayload.channel.id,
    text,
  });

  return {
    ...sent,
    channel: sent.channel ?? openPayload.channel.id,
  };
}
