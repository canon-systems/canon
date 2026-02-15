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

export function formatWeeklyDigestEmail(params: {
  window: MetricWindow;
  signals: SignalRecord[];
}): { subject: string; text: string; html: string } {
  const { window } = params;
  const signals = sortSignalsByPriority(params.signals).slice(0, 3);
  const subject = `Canon Weekly Insight (${window.start.slice(0, 10)} to ${window.end.slice(0, 10)})`;

  const textLines = [
    'Canon Weekly Insight',
    `Window: ${window.start} -> ${window.end}`,
    '',
  ];

  const htmlItems: string[] = [];
  if (signals.length === 0) {
    textLines.push('System stable. No significant deviations.');
    htmlItems.push('<li>System stable. No significant deviations.</li>');
  } else {
    for (const signal of signals) {
      textLines.push(`- [${signal.severity.toUpperCase()}] ${signal.title} - ${signal.summary_line}`);
      textLines.push(`  Investigate: ${signalUrl(signal.id)}`);
      htmlItems.push(
        `<li><strong>[${signal.severity.toUpperCase()}]</strong> ${signal.title}<br/>${signal.summary_line}<br/><a href=\"${signalUrl(signal.id)}\">Investigate</a></li>`
      );
    }
  }

  const html = [
    '<div style="font-family:Arial,sans-serif;line-height:1.5;">',
    '<h2>Canon Weekly Insight</h2>',
    `<p><strong>Window:</strong> ${window.start} to ${window.end}</p>`,
    '<ul>',
    ...htmlItems,
    '</ul>',
    '</div>',
  ].join('');

  return {
    subject,
    text: textLines.join('\n'),
    html,
  };
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

export async function sendEmailDigest(params: {
  to: string | null;
  subject: string;
  text: string;
  html: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const { to, subject, text, html } = params;
  if (!to || to.trim().length === 0) {
    return { sent: false, reason: 'No email destination configured.' };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || 'Canon <noreply@canon.local>';
  if (!apiKey) {
    return { sent: false, reason: 'RESEND_API_KEY not configured.' };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to.trim()],
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => 'Email API request failed');
    return { sent: false, reason: payload };
  }

  return { sent: true };
}
