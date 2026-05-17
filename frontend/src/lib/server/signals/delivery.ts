import type { SupabaseClient } from '@supabase/supabase-js';
import { getProviderAccessToken } from '@/lib/server/oauth/tokenStore';

async function resolveSlackConnectionId(params: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<string | null> {
  const { supabase, userId } = params;
  const { data } = await supabase
    .from('oauth_connections')
    .select('connection_id')
    .eq('user_id', userId)
    .eq('provider', 'slack')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const connectionId = data?.connection_id;
  return typeof connectionId === 'string' && connectionId.length > 0 ? connectionId : null;
}

export async function sendSlackMessage(params: {
  supabase: SupabaseClient;
  userId: string;
  channel: string | null;
  text: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const { supabase, userId, channel, text } = params;

  const normalizedChannel = typeof channel === 'string' ? channel.trim() : '';
  if (!normalizedChannel) {
    return { sent: false, reason: 'No Slack channel configured.' };
  }
  const slackChannel = normalizedChannel.startsWith('#') ? normalizedChannel.slice(1) : normalizedChannel;
  if (!slackChannel) {
    return { sent: false, reason: 'No Slack channel configured.' };
  }

  const connectionId = await resolveSlackConnectionId({ supabase, userId });
  if (!connectionId) {
    return { sent: false, reason: 'No active Slack connection.' };
  }

  const accessToken = await getProviderAccessToken({ provider: 'slack', connectionId });
  if (!accessToken) {
    return { sent: false, reason: 'No Slack access token available.' };
  }

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
    return { sent: false, reason: payload };
  }

  const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!payload.ok) {
    return { sent: false, reason: payload.error || 'Slack API returned ok=false' };
  }

  return { sent: true };
}
