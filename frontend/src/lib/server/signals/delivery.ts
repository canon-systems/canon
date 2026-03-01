import type { SupabaseClient } from '@supabase/supabase-js';
import type { MetricWindow, SignalRecord } from '@/lib/server/signals/types';
import { getProviderAccessToken } from '@/lib/server/oauth/tokenStore';
import { sortSignalsByPriority } from '@/lib/server/signals/engine';

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    return parsed.origin;
  } catch {
    return '';
  }
}

function appUrl() {
  const configured = process.env.CANON_WEBHOOK_BASE_URL;
  if (typeof configured === 'string') {
    return normalizeBaseUrl(configured);
  }
  return '';
}

function signalUrl(signalId: string): string {
  const base = appUrl();
  if (!base) return `/signals/${signalId}`;
  return `${base}/signals/${signalId}`;
}

function toDateOnlyUtc(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

function toDateOnlyInTimeZone(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    if (!year || !month || !day) return value;
    return `${year}-${month}-${day}`;
  } catch {
    return toDateOnlyUtc(value);
  }
}

function resolveBaselineWindow(signals: SignalRecord[]): MetricWindow | null {
  if (signals.length === 0) return null;
  let start = '';
  let end = '';

  for (const signal of signals) {
    if (!start || signal.baseline_start < start) start = signal.baseline_start;
    if (!end || signal.baseline_end > end) end = signal.baseline_end;
  }

  if (!start || !end) return null;
  return { start, end };
}

function formatNumber(value: number, maxFractionDigits = 1): string {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  });
}

function formatSignedPercent(value: number): string {
  if (!Number.isFinite(value)) return '0%';
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return `${value > 0 ? '+' : ''}${formatNumber(value, digits)}%`;
}

function formatSignedNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return `${value > 0 ? '+' : ''}${formatNumber(value, digits)}`;
}

function normalizePercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.abs(value) <= 1 ? value * 100 : value;
}

function relativePercentChange(current: number, baseline: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(baseline)) return 0;
  if (baseline === 0) return 0;
  return ((current - baseline) / Math.abs(baseline)) * 100;
}

function humanSeverity(severity: SignalRecord['severity']): string {
  return severity === 'significant' ? 'Significant' : 'Elevated';
}

function scopeSummary(signal: SignalRecord): string {
  if (signal.scope_type === 'repo' && signal.scope_id) return `Scope: Repo ${signal.scope_id}`;
  if (signal.scope_type === 'ticketing') return `Scope: ${signal.scope_id || 'Ticketing workspace'}`;
  return 'Scope: Global';
}

function surfaceCategoryLines(signal: SignalRecord): string[] {
  const metadataTargetsRaw = signal.metadata?.targets;
  const metadataTargets = Array.isArray(metadataTargetsRaw)
    ? metadataTargetsRaw
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0)
    : [];

  const scopeTargets =
    typeof signal.scope_id === 'string'
      ? signal.scope_id
          .split(/[,|]/)
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      : [];

  const uniqueTargets = Array.from(new Set([...metadataTargets, ...scopeTargets]));

  if (signal.scope_type === 'repo') {
    const targets = uniqueTargets.length > 0 ? uniqueTargets : ['Unknown repository'];
    return [
      'Surface:',
      '   Category: Repository',
      '   Targets:',
      ...targets.map((target) => `   - ${target}`),
    ];
  }

  if (signal.scope_type === 'ticketing') {
    const targets = uniqueTargets.length > 0 ? uniqueTargets : ['Workspace'];
    return [
      'Surface:',
      '   Category: Ticketing',
      '   Targets:',
      ...targets.map((target) => `   - ${target}`),
    ];
  }

  const targets = uniqueTargets.length > 0 ? uniqueTargets : ['Workspace-wide'];
  return [
    'Surface:',
    '   Category: Global',
    '   Targets:',
    ...targets.map((target) => `   - ${target}`),
  ];
}

function metricLabel(metricKey: string): string {
  if (metricKey === 'regression_rate') return 'Regression rate';
  if (metricKey === 'tickets_completed') return 'Tickets completed';
  if (metricKey === 'tickets_regressed') return 'Tickets regressed';
  if (metricKey === 'prs_opened') return 'PRs opened';
  if (metricKey === 'prs_merged') return 'PRs merged';
  if (metricKey === 'repos_touched') return 'Repos touched';
  if (metricKey === 'repo_distribution') return 'Repo concentration';
  return metricKey.replace(/_/g, ' ');
}

function metricSummary(signal: SignalRecord): string {
  const label = metricLabel(signal.metric_key);
  const percentMetric =
    signal.metric_key === 'regression_rate' ||
    signal.metric_key === 'repo_distribution';

  if (percentMetric) {
    const current = normalizePercent(signal.current_value);
    const baseline = normalizePercent(signal.baseline_value);
    const ppChange = current - baseline;
    return `${label} change vs baseline: ${formatSignedNumber(ppChange)} pp`;
  }

  const current = Math.round(signal.current_value);
  const baseline = Math.round(signal.baseline_value);
  const absolute = current - baseline;
  if (baseline === 0) {
    if (current === 0) return `${label} change vs baseline: No change (0)`;
    return `${label} change vs baseline: ${formatSignedNumber(absolute)} (from 0)`;
  }
  const pctChange = relativePercentChange(current, baseline);
  return `${label} change vs baseline: ${formatSignedNumber(absolute)} absolute (${formatSignedPercent(pctChange)})`;
}

function structuralSummary(signal: SignalRecord): string | null {
  const posture = signal.structural?.risk?.posture;
  const sentence = signal.structural?.sentence;
  const confidence = signal.structural?.confidence;
  const parts: string[] = [];
  if (posture) parts.push(`Execution posture: ${posture.toUpperCase()}`);
  if (sentence) parts.push(sentence);
  if (confidence && confidence !== 'mature') parts.push(`Confidence: ${confidence}`);
  return parts.length > 0 ? parts.join(' | ') : null;
}

export function formatWeeklyDigestMessage(params: {
  window: MetricWindow;
  signals: SignalRecord[];
}): string {
  const { window } = params;
  const signals = sortSignalsByPriority(params.signals).slice(0, 3);
  const significantCount = signals.filter((signal) => signal.severity === 'significant').length;
  const elevatedCount = signals.length - significantCount;

  const lines = [
    '*Canon Weekly Insight*',
    `Window: ${toDateOnlyUtc(window.start)} to ${toDateOnlyUtc(window.end)} (UTC)`,
    `Signals: ${signals.length} (${significantCount} significant, ${elevatedCount} elevated)`,
    '',
  ];

  if (signals.length === 0) {
    lines.push('System stable. No significant deviations.');
    return lines.join('\n');
  }

  signals.forEach((signal, index) => {
    lines.push(`${index + 1}. *${signal.title}* [${humanSeverity(signal.severity)}]`);
    lines.push(`   ${metricSummary(signal)}`);
    const structural = structuralSummary(signal);
    if (structural) lines.push(`   ${structural}`);
    lines.push(`   ${scopeSummary(signal)}`);
    lines.push(`   Open: ${signalUrl(signal.id)}`);
    if (index < signals.length - 1) lines.push('');
  });

  return lines.join('\n');
}

export function formatDailySignalAlertMessage(params: {
  window: MetricWindow;
  signals: SignalRecord[];
  timeZone?: string;
}): string {
  const { window } = params;
  const timeZone = typeof params.timeZone === 'string' && params.timeZone.trim().length > 0 ? params.timeZone.trim() : 'UTC';
  const signals = sortSignalsByPriority(params.signals);
  const topSignals = signals.slice(0, 5);
  const significantCount = signals.filter((signal) => signal.severity === 'significant').length;
  const elevatedCount = signals.length - significantCount;
  const baselineWindow = resolveBaselineWindow(signals);
  const windowStartLabel = toDateOnlyInTimeZone(window.start, timeZone);
  const windowEndLabel = toDateOnlyInTimeZone(window.end, timeZone);
  const baselineStartLabel = baselineWindow ? toDateOnlyInTimeZone(baselineWindow.start, timeZone) : 'n/a';
  const baselineEndLabel = baselineWindow ? toDateOnlyInTimeZone(baselineWindow.end, timeZone) : 'n/a';

  const lines = [
    '*Canon Daily Signal Alert*',
    `Window: ${windowStartLabel} to ${windowEndLabel} (${timeZone})`,
    `Baseline: ${baselineStartLabel} to ${baselineEndLabel} (${timeZone})`,
    `Detected: ${signals.length} signal(s) (${significantCount} significant, ${elevatedCount} elevated)`,
    '',
  ];

  if (signals.length === 0) {
    lines.push('No signals were detected in this run.');
    return lines.join('\n');
  }

  if (significantCount > 0) {
    lines.push(`Priority: review ${significantCount} significant signal(s) first.`);
  } else {
    lines.push('Priority: elevated signals only in this run.');
  }
  lines.push('');

  topSignals.forEach((signal, index) => {
    lines.push(`${index + 1}. [${humanSeverity(signal.severity).toUpperCase()}] *${signal.title}*`);
    lines.push(`   ${signal.summary_line}`);
    lines.push(`   ${metricSummary(signal)}`);
    const structural = structuralSummary(signal);
    if (structural) lines.push(`   ${structural}`);
    for (const surfaceLine of surfaceCategoryLines(signal)) {
      lines.push(`   ${surfaceLine}`);
    }
    lines.push(`   Click the link to investigate: ${signalUrl(signal.id)}`);
    if (index < topSignals.length - 1) lines.push('');
  });

  if (signals.length > topSignals.length) {
    lines.push('');
    lines.push(`+${signals.length - topSignals.length} additional signal(s) not shown.`);
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
      if (structuralSummary(signal)) textLines.push(`  ${structuralSummary(signal)}`);
      textLines.push(`  Investigate: ${signalUrl(signal.id)}`);
      htmlItems.push(
        `<li><strong>[${signal.severity.toUpperCase()}]</strong> ${signal.title}<br/>${signal.summary_line}${structuralSummary(signal) ? `<br/>${structuralSummary(signal)}` : ''}<br/><a href=\"${signalUrl(signal.id)}\">Investigate</a></li>`
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

export function formatDailySignalAlertEmail(params: {
  window: MetricWindow;
  signals: SignalRecord[];
}): { subject: string; text: string; html: string } {
  const { window } = params;
  const signals = sortSignalsByPriority(params.signals);
  const subject = `Canon Daily Signal Alert (${window.start.slice(0, 10)} to ${window.end.slice(0, 10)})`;

  const textLines = [
    'Canon Daily Signal Alert',
    `Window: ${window.start} -> ${window.end}`,
    '',
  ];

  const htmlItems: string[] = [];
  if (signals.length === 0) {
    textLines.push('No signals were detected in this run.');
    htmlItems.push('<li>No signals were detected in this run.</li>');
  } else {
    for (const signal of signals) {
      textLines.push(`- [${signal.severity.toUpperCase()}] ${signal.title} - ${signal.summary_line}`);
      if (structuralSummary(signal)) textLines.push(`  ${structuralSummary(signal)}`);
      textLines.push(`  Investigate: ${signalUrl(signal.id)}`);
      htmlItems.push(
        `<li><strong>[${signal.severity.toUpperCase()}]</strong> ${signal.title}<br/>${signal.summary_line}${structuralSummary(signal) ? `<br/>${structuralSummary(signal)}` : ''}<br/><a href=\"${signalUrl(signal.id)}\">Investigate</a></li>`
      );
    }
  }

  const html = [
    '<div style="font-family:Arial,sans-serif;line-height:1.5;">',
    '<h2>Canon Daily Signal Alert</h2>',
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
    `[${humanSeverity(signal.severity)}] ${signal.title}`,
    metricSummary(signal),
    scopeSummary(signal),
    `Open: ${signalUrl(signal.id)}`,
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
