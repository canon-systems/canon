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

function toShortDateInTimeZone(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch {
    return toDateOnlyUtc(value);
  }
}

function toShortDateRangeInTimeZone(start: string, end: string, timeZone: string): string {
  return `${toShortDateInTimeZone(start, timeZone)} - ${toShortDateInTimeZone(end, timeZone)}`;
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

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(count, 0)} ${Math.abs(count) === 1 ? singular : plural}`;
}

function windowLengthInDays(window: MetricWindow): number {
  const start = new Date(window.start);
  const end = new Date(window.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1);
}

function scopeSummary(signal: SignalRecord): string {
  if (signal.scope_type === 'repo' && signal.scope_id) return `Scope: Repo ${signal.scope_id}`;
  if (signal.scope_type === 'ticketing') return `Scope: ${signal.scope_id || 'Ticketing workspace'}`;
  return 'Scope: Global';
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

function signalTargets(signal: SignalRecord): string[] {
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

  return Array.from(new Set([...metadataTargets, ...scopeTargets]));
}

function primaryArea(signal: SignalRecord): string {
  const targets = signalTargets(signal);
  if (signal.scope_type === 'ticketing') {
    return targets[0] || signal.scope_id || 'This team';
  }
  if (signal.scope_type === 'repo') {
    return targets[0] || 'This repo';
  }
  return targets[0] || 'This team';
}

function persistenceSummary(signal: SignalRecord): string | null {
  const persistence = signal.structural?.persistence;
  if (!persistence) return null;

  if (persistence.current_streak >= 2) {
    return `This has held for ${persistence.current_streak} straight windows.`;
  }

  if (persistence.is_sustained) {
    return `This pattern is sustained across ${persistence.breach_windows} of the last ${persistence.lookback_windows} windows.`;
  }

  return null;
}

function headlineSummary(signals: SignalRecord[]): string {
  const significantCount = signals.filter((signal) => signal.severity === 'significant').length;
  const elevatedCount = signals.length - significantCount;

  if (signals.length === 1) {
    return significantCount === 1 ? '1 significant signal needs attention.' : '1 elevated signal needs attention.';
  }

  if (significantCount > 0 && elevatedCount > 0) {
    return `${signals.length} signals need attention: ${significantCount} significant and ${elevatedCount} elevated.`;
  }

  if (significantCount > 0) {
    return `${signals.length} significant signals need attention.`;
  }

  return `${signals.length} elevated signals need attention.`;
}

function plainSignalHeadline(signal: SignalRecord, windowDays: number): string {
  const area = primaryArea(signal);
  const streak = signal.structural?.persistence?.current_streak || 0;
  const durationDays = streak > 0 && windowDays > 0 ? streak * windowDays : 0;

  if (signal.type === 'merge_drop' || signal.type === 'throughput_drop') {
    if (durationDays > 0) return `Work in ${area} has been lower than usual for ${durationDays} days.`;
    return `Work in ${area} is lower than usual.`;
  }
  if (signal.type === 'regression_spike') {
    if (durationDays > 0) return `More tickets in ${area} have moved backward for ${durationDays} days.`;
    return `More tickets in ${area} are moving backward than usual.`;
  }
  if (signal.type === 'repo_concentration' || signal.type === 'domain_concentration') {
    return `More of the work is staying in ${area} than usual.`;
  }
  return `${area} needs attention.`;
}

type RollingWindowLine = {
  window_start: string;
  window_end: string;
  entries: Array<{
    metric_key: string;
    value: number;
    is_current: boolean;
  }>;
};

function plainMetricLine(metricKey: string, value: number, isCurrent: boolean): string | null {
  const rounded = Math.round(value);

  if (metricKey === 'prs_merged') {
    if (rounded <= 0) return 'No PRs were merged.';
    if (isCurrent && rounded === 1) return 'Only 1 PR was merged.';
    return `${pluralize(rounded, 'PR')} ${rounded === 1 ? 'was' : 'were'} merged.`;
  }

  if (metricKey === 'tickets_completed') {
    if (rounded <= 0) return 'No tickets were finished.';
    if (isCurrent && rounded <= 2) return `Only ${pluralize(rounded, 'ticket')} ${rounded === 1 ? 'was' : 'were'} finished.`;
    return `${pluralize(rounded, 'ticket')} ${rounded === 1 ? 'was' : 'were'} finished.`;
  }

  if (metricKey === 'tickets_regressed') {
    if (rounded <= 0) return 'No tickets moved backward.';
    return `${pluralize(rounded, 'ticket')} ${rounded === 1 ? 'moved' : 'moved'} backward.`;
  }

  if (metricKey === 'repo_distribution') {
    const share = normalizePercent(value);
    return `${formatNumber(share, 0)}% of the work stayed in one repo.`;
  }

  return null;
}

function rollingHistory(signal: SignalRecord): RollingWindowLine[] {
  const history = signal.structural?.persistence?.metric_history;
  if (!Array.isArray(history) || history.length === 0) return [];

  return history
    .filter(
      (entry): entry is NonNullable<typeof entry> =>
        Boolean(entry && typeof entry.window_start === 'string' && typeof entry.window_end === 'string' && typeof entry.value === 'number')
    )
    .map((entry) => ({
      window_start: entry.window_start || '',
      window_end: entry.window_end || '',
      entries: [
        {
          metric_key: signal.metric_key,
          value: entry.value,
          is_current: Boolean(entry.is_current),
        },
      ],
    }));
}

function combineRollingWindows(signals: SignalRecord[]): RollingWindowLine[] {
  const grouped = new Map<string, RollingWindowLine>();

  for (const signal of signals) {
    for (const item of rollingHistory(signal)) {
      const key = `${item.window_start}__${item.window_end}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.entries.push(...item.entries);
      } else {
        grouped.set(key, {
          window_start: item.window_start,
          window_end: item.window_end,
          entries: [...item.entries],
        });
      }
    }
  }

  return Array.from(grouped.values())
    .sort((a, b) => new Date(a.window_start).getTime() - new Date(b.window_start).getTime())
    .slice(-4);
}

function rollingWindowLabel(index: number, total: number): string {
  if (index === 0) return 'Onset';
  if (index === total - 1) return 'Current';
  return `Window ${index}`;
}

function rollingWindowBody(windowLine: RollingWindowLine): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const entry of windowLine.entries) {
    if (seen.has(entry.metric_key)) continue;
    seen.add(entry.metric_key);
    const line = plainMetricLine(entry.metric_key, entry.value, entry.is_current);
    if (line) lines.push(line);
  }

  return lines;
}

function fallbackPlainSignalBlock(signal: SignalRecord): string[] {
  const lines = [`*${humanSeverity(signal.severity)}: ${signal.title}*`];

  if (signal.metric_key === 'prs_merged') {
    lines.push(`Right now: ${plainMetricLine(signal.metric_key, signal.current_value, true)}`);
  } else if (signal.metric_key === 'tickets_completed') {
    lines.push(`Right now: ${plainMetricLine(signal.metric_key, signal.current_value, true)}`);
  } else if (signal.metric_key === 'tickets_regressed') {
    lines.push(`Right now: ${plainMetricLine(signal.metric_key, signal.current_value, true)}`);
  } else {
    lines.push(`Right now: ${signal.summary_line}`);
  }

  const persistence = persistenceSummary(signal);
  if (persistence) lines.push(persistence);
  lines.push(`Look here: ${signalUrl(signal.id)}`);
  return lines;
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
  const primarySignal = topSignals[0] || null;
  const windowRangeLabel = toShortDateRangeInTimeZone(window.start, window.end, timeZone);
  const windowDays = windowLengthInDays(window);
  const rollingSignals = topSignals.filter((signal) =>
    signal.metric_key === 'prs_merged' ||
    signal.metric_key === 'tickets_completed' ||
    signal.metric_key === 'tickets_regressed' ||
    signal.metric_key === 'repo_distribution'
  );
  const historyWindows = combineRollingWindows(rollingSignals);

  const lines = [
    '*Signal Alert Rolling*',
    `*${windowDays}-Day Window:*`,
    windowRangeLabel,
    '',
  ];

  if (signals.length === 0) {
    lines.push('No signals were detected in this run.');
    return lines.join('\n');
  }

  if (primarySignal) {
    lines.push(plainSignalHeadline(primarySignal, windowDays));
    lines.push('');
  } else {
    lines.push(headlineSummary(signals));
    lines.push('');
  }

  if (historyWindows.length >= 2) {
    historyWindows.forEach((historyWindow, index) => {
      lines.push(`*${rollingWindowLabel(index, historyWindows.length)}* (${toShortDateRangeInTimeZone(historyWindow.window_start, historyWindow.window_end, timeZone)})`);
      for (const line of rollingWindowBody(historyWindow)) {
        lines.push(line);
      }
      if (index < historyWindows.length - 1) lines.push('');
    });
  } else {
    topSignals.forEach((signal, index) => {
      for (const line of fallbackPlainSignalBlock(signal)) {
        lines.push(line);
      }
      if (index < topSignals.length - 1) lines.push('');
    });
  }

  lines.push('');
  lines.push('If this is planned, fine. If not, now is the time to ask why.');

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
