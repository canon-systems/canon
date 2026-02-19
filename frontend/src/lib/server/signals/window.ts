import type { SignalSeverity } from '@/lib/server/signals/types';

const MIN_WINDOW_DAYS = 1;
export const DEFAULT_SIGNAL_WINDOW_DAYS = 7;
export const MAX_SIGNAL_WINDOW_DAYS = 90;

function toISO(date: Date): string {
  return date.toISOString();
}

/**
 * Returns a window of whole UTC days ending yesterday.
 * Example: windowDays=1 on Feb 3 -> Feb 2 00:00:00.000 to Feb 2 23:59:59.999.
 */
export function getWindowForDays(windowDays: number, now: Date = new Date()): { start: string; end: string } {
  const days = Number.isFinite(windowDays) && windowDays > 0 ? Math.floor(windowDays) : MIN_WINDOW_DAYS;
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  end.setUTCDate(end.getUTCDate() - 1);

  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  start.setUTCHours(0, 0, 0, 0);

  return { start: toISO(start), end: toISO(end) };
}

export function normalizeWindowDays(
  windowDays: number | null | undefined,
  fallbackDays = DEFAULT_SIGNAL_WINDOW_DAYS
): number {
  const candidate = Number.isFinite(windowDays) ? Math.floor(windowDays as number) : fallbackDays;
  return Math.max(MIN_WINDOW_DAYS, candidate);
}

export function getNormalizedWindowForDays(
  windowDays: number | null | undefined,
  now = new Date(),
  fallbackDays = DEFAULT_SIGNAL_WINDOW_DAYS
): { start: string; end: string } {
  return getWindowForDays(normalizeWindowDays(windowDays, fallbackDays), now);
}

export function parseWindowDaysParam(
  raw: string | null | undefined,
  maxDays = MAX_SIGNAL_WINDOW_DAYS
): number | null {
  if (raw == null) return null;
  const parsed = Number.parseInt(String(raw).replace(/d$/i, ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(parsed, Math.max(MIN_WINDOW_DAYS, maxDays));
}

export function windowStartFromParam(
  raw: string | null | undefined,
  now = new Date(),
  maxDays = MAX_SIGNAL_WINDOW_DAYS
): string | undefined {
  const windowDays = parseWindowDaysParam(raw, maxDays);
  if (windowDays == null) return undefined;
  return getWindowForDays(windowDays, now).start;
}

export function parseSignalSeverityParam(raw: string | null | undefined): SignalSeverity | undefined {
  return raw === 'elevated' || raw === 'significant' ? raw : undefined;
}
