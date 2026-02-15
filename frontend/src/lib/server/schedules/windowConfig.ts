import { getWindowForDays } from './cadence';

const MIN_WINDOW_DAYS = 1;
export const MAX_WINDOW_DAYS = 30;

type ParseResult =
  | { kind: 'missing' }
  | { kind: 'valid'; value: number }
  | { kind: 'invalid'; reason: string };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseDayValue(value: unknown): ParseResult {
  if (value == null) {
    return { kind: 'missing' };
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      return { kind: 'invalid', reason: 'must be an integer' };
    }
    return { kind: 'valid', value };
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return { kind: 'missing' };
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      return { kind: 'invalid', reason: 'must be an integer' };
    }
    return { kind: 'valid', value: parsed };
  }

  return { kind: 'invalid', reason: 'must be an integer' };
}

function readWindowDays(communication: Record<string, unknown>): ParseResult {
  const values: number[] = [];

  if (Object.prototype.hasOwnProperty.call(communication, 'window_days')) {
    const topLevel = parseDayValue(communication.window_days);
    if (topLevel.kind === 'invalid') {
      return { kind: 'invalid', reason: `communication.window_days ${topLevel.reason}` };
    }
    if (topLevel.kind === 'valid') {
      values.push(topLevel.value);
    }
  }

  const windowValue = communication.window;
  if (windowValue && typeof windowValue === 'object' && !Array.isArray(windowValue)) {
    const windowRecord = windowValue as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(windowRecord, 'days')) {
      const nested = parseDayValue(windowRecord.days);
      if (nested.kind === 'invalid') {
        return { kind: 'invalid', reason: `communication.window.days ${nested.reason}` };
      }
      if (nested.kind === 'valid') {
        values.push(nested.value);
      }
    }
  }

  if (values.length === 0) {
    return { kind: 'missing' };
  }

  const first = values[0];
  const hasConflict = values.some((value) => value !== first);
  if (hasConflict) {
    return {
      kind: 'invalid',
      reason: 'communication.window_days and communication.window.days must match',
    };
  }

  return { kind: 'valid', value: first };
}

function clampWindowDays(days: number): number {
  return Math.max(MIN_WINDOW_DAYS, Math.min(MAX_WINDOW_DAYS, days));
}

export function defaultWindowDaysForCadence(cadence: string): number {
  const normalized = String(cadence || '').toLowerCase();
  if (normalized === 'daily') return 1;
  if (normalized === 'weekly') return 7;
  if (normalized === 'monthly') return 30;
  return 7;
}

export function windowDaysValidationError(reason: string): string {
  return `Invalid report window: ${reason}. window_days must be an integer between ${MIN_WINDOW_DAYS} and ${MAX_WINDOW_DAYS}.`;
}

export function normalizeSignalWindowCommunication(params: {
  communication: unknown;
  cadence: string;
}): { ok: true; communication: Record<string, unknown>; windowDays: number } | { ok: false; error: string } {
  const base = asRecord(params.communication);
  const parsed = readWindowDays(base);
  if (parsed.kind === 'invalid') {
    return { ok: false, error: windowDaysValidationError(parsed.reason) };
  }

  const resolvedWindowDays =
    parsed.kind === 'valid'
      ? parsed.value
      : defaultWindowDaysForCadence(params.cadence);

  if (
    !Number.isFinite(resolvedWindowDays) ||
    !Number.isInteger(resolvedWindowDays) ||
    resolvedWindowDays < MIN_WINDOW_DAYS ||
    resolvedWindowDays > MAX_WINDOW_DAYS
  ) {
    return {
      ok: false,
      error: windowDaysValidationError(
        `received ${resolvedWindowDays}`
      ),
    };
  }

  const next = { ...base };
  const windowRecord = asRecord(next.window);
  next.window = {
    ...windowRecord,
    days: resolvedWindowDays,
  };
  next.window_days = resolvedWindowDays;

  return { ok: true, communication: next, windowDays: resolvedWindowDays };
}

export function resolveSignalWindowDays(params: {
  communication: unknown;
  cadence: string;
}): number {
  const base = asRecord(params.communication);
  const parsed = readWindowDays(base);
  if (parsed.kind !== 'valid') {
    return defaultWindowDaysForCadence(params.cadence);
  }
  return clampWindowDays(parsed.value);
}

export function resolveSignalPrimaryWindow(params: {
  communication: unknown;
  cadence: string;
  now?: Date;
}): { start: string; end: string; windowDays: number } {
  const windowDays = resolveSignalWindowDays({
    communication: params.communication,
    cadence: params.cadence,
  });
  const window = getWindowForDays(windowDays, params.now);
  return {
    start: window.start,
    end: window.end,
    windowDays,
  };
}
