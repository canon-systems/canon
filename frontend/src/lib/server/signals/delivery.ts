import type { SupabaseClient } from '@supabase/supabase-js';
import type { MetricWindow, SignalRecord } from '@/lib/server/signals/types';
import { getProviderAccessToken } from '@/lib/server/oauth/tokenStore';
import { sortSignalsByPriority } from '@/lib/server/signals/engine';

function appUrl() {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (typeof url === 'string' && url.trim().length > 0) return url.replace(/\/$/, '');
  return '';
}

function signalUrl(signalId: string): string {
  const base = appUrl();
  if (!base) return `/signals/${signalId}`;
  return `${base}/signals/${signalId}`;
}

export function formatWeeklyDigestMessage(params: {
  window: MetricWindow;
  signals: SignalRecord[];
}): string {
  const { window } = params;
  const signals = sortSignalsByPriority(params.signals).slice(0, 3);

  const lines = [
    '*Canon Weekly Insight*',
    `Window: ${window.start} → ${window.end}`,
    '',
  ];

  if (signals.length === 0) {
    lines.push('System stable. No significant deviations.');
    return lines.join('\n');
  }

  for (const signal of signals) {
    lines.push(`• [${signal.severity.toUpperCase()}] ${signal.title} — ${signal.summary_line}`);
    lines.push(`  Investigate: ${signalUrl(signal.id)}`);
  }

  return lines.join('\n');
}

export function isSevereAlertSignal(signal: SignalRecord): boolean {
  return signal.type === 'regression_spike' && signal.severity === 'significant' && signal.percent_change >= 100;
}

export function formatAlertMessage(signal: SignalRecord): string {
  const lines = [
    '*Canon Alert*',
    `[${signal.severity.toUpperCase()}] ${signal.title}`,
    signal.summary_line,
    `Investigate: ${signalUrl(signal.id)}`,
  ];
  return lines.join('\n');
}

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

  if (!channel || channel.trim().length === 0) {
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
      channel,
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
