import type { SignalSeverity } from '@/lib/server/signals/types';
import { DateTime, IANAZone } from 'luxon';

const MIN_WINDOW_DAYS = 1;
export const DEFAULT_SIGNAL_WINDOW_DAYS = 7;
export const MAX_SIGNAL_WINDOW_DAYS = 90;
export const DEFAULT_SIGNAL_TIME_ZONE = 'UTC';

function toISO(dateTime: DateTime): string {
  return dateTime.toUTC().toISO({ suppressMilliseconds: false }) ?? new Date(dateTime.toMillis()).toISOString();
}

function isValidTimeZone(value: string): boolean {
  return IANAZone.isValidZone(value);
}

export function parseTimeZoneParam(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const candidate = raw.trim();
  if (!candidate) return null;
  return isValidTimeZone(candidate) ? candidate : null;
}

export function normalizeTimeZone(
  raw: string | null | undefined,
  fallback: string = DEFAULT_SIGNAL_TIME_ZONE
): string {
  return parseTimeZoneParam(raw) || parseTimeZoneParam(fallback) || DEFAULT_SIGNAL_TIME_ZONE;
}

function parseUtcIso(iso: string): DateTime | null {
  const parsed = DateTime.fromISO(iso, { zone: 'utc' });
  if (!parsed.isValid) return null;
  return parsed;
}

function localDayFromUtcIso(iso: string, timeZone: string): DateTime | null {
  const utc = parseUtcIso(iso);
  if (!utc) return null;
  return utc.setZone(timeZone).startOf('day');
}

function toUtcRangeForLocalDays(startLocalDay: DateTime, endLocalDay: DateTime): { start: string; end: string } {
  const startUtc = startLocalDay.startOf('day').toUTC();
  const endUtc = endLocalDay.startOf('day').plus({ days: 1 }).minus({ milliseconds: 1 }).toUTC();
  return {
    start: toISO(startUtc),
    end: toISO(endUtc),
  };
}

function countLocalDaysInclusive(startLocalDay: DateTime, endLocalDay: DateTime): number {
  if (endLocalDay < startLocalDay) return 1;

  let count = 1;
  let cursor = startLocalDay.startOf('day');
  const end = endLocalDay.startOf('day');

  while (cursor < end) {
    cursor = cursor.plus({ days: 1 }).startOf('day');
    count += 1;
    if (count > 3660) break;
  }

  return count;
}

/**
 * Returns a window of whole local days ending yesterday in the provided timezone.
 * Example: windowDays=1 on Feb 3 local -> Feb 2 local day boundaries converted to UTC.
 */
export function getWindowForDays(
  windowDays: number,
  now: Date = new Date(),
  timeZone: string = DEFAULT_SIGNAL_TIME_ZONE
): { start: string; end: string } {
  const days = Number.isFinite(windowDays) && windowDays > 0 ? Math.floor(windowDays) : MIN_WINDOW_DAYS;
  const zone = normalizeTimeZone(timeZone);
  const zonedNow = DateTime.fromJSDate(now, { zone });
  const endLocalDay = zonedNow.startOf('day').minus({ days: 1 });
  const startLocalDay = endLocalDay.minus({ days: days - 1 });

  return toUtcRangeForLocalDays(startLocalDay, endLocalDay);
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
  fallbackDays = DEFAULT_SIGNAL_WINDOW_DAYS,
  timeZone: string = DEFAULT_SIGNAL_TIME_ZONE
): { start: string; end: string } {
  return getWindowForDays(normalizeWindowDays(windowDays, fallbackDays), now, timeZone);
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
  maxDays = MAX_SIGNAL_WINDOW_DAYS,
  timeZone: string = DEFAULT_SIGNAL_TIME_ZONE
): string | undefined {
  const windowDays = parseWindowDaysParam(raw, maxDays);
  if (windowDays == null) return undefined;
  return getWindowForDays(windowDays, now, timeZone).start;
}

export function windowDayCount(window: { start: string; end: string }, timeZone: string = DEFAULT_SIGNAL_TIME_ZONE): number {
  const zone = normalizeTimeZone(timeZone);
  const startLocalDay = localDayFromUtcIso(window.start, zone);
  const endLocalDay = localDayFromUtcIso(window.end, zone);
  if (!startLocalDay || !endLocalDay) return 1;
  return countLocalDaysInclusive(startLocalDay, endLocalDay);
}

export function computeBaselineWindowForTimeZone(
  primaryWindow: { start: string; end: string },
  timeZone: string = DEFAULT_SIGNAL_TIME_ZONE
): { start: string; end: string } {
  const zone = normalizeTimeZone(timeZone);
  const startLocalDay = localDayFromUtcIso(primaryWindow.start, zone);
  const endLocalDay = localDayFromUtcIso(primaryWindow.end, zone);

  if (!startLocalDay || !endLocalDay || endLocalDay < startLocalDay) {
    throw new Error('Invalid primary window');
  }

  const dayCount = countLocalDaysInclusive(startLocalDay, endLocalDay);
  const baselineEndLocalDay = startLocalDay.minus({ days: 1 }).startOf('day');
  const baselineStartLocalDay = baselineEndLocalDay.minus({ days: dayCount - 1 }).startOf('day');

  return toUtcRangeForLocalDays(baselineStartLocalDay, baselineEndLocalDay);
}

export function parseSignalSeverityParam(raw: string | null | undefined): SignalSeverity | undefined {
  return raw === 'elevated' || raw === 'significant' ? raw : undefined;
}
