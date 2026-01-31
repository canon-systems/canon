/**
 * Cadence helpers for report_schedules: due-check and time window for diff runs.
 */

function toISO(date: Date): string {
  return date.toISOString();
}

/**
 * Returns a time window { start, end } in ISO format for the given cadence.
 * Used as the diff report window (e.g. "last 7 days" for weekly).
 */
export function getWindowForCadence(cadence: string, now: Date = new Date()): { start: string; end: string } {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);

  switch (cadence) {
    case 'daily':
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'weekly':
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      break;
    case 'bi-weekly':
      start.setDate(start.getDate() - 14);
      start.setHours(0, 0, 0, 0);
      break;
    case 'monthly':
      start.setMonth(start.getMonth() - 1);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'custom':
    default:
      // Default to last 7 days for custom or unknown
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      break;
  }

  return { start: toISO(start), end: toISO(end) };
}

/**
 * Returns true if the schedule is due to run (enough time has passed since last_run_at).
 */
export function isScheduleDue(
  lastRunAt: Date | string | null,
  cadence: string,
  now: Date = new Date()
): boolean {
  const last = lastRunAt == null ? null : typeof lastRunAt === 'string' ? new Date(lastRunAt) : lastRunAt;
  if (last != null && Number.isNaN(last.getTime())) return true;

  const msSinceLast = last == null ? Infinity : now.getTime() - last.getTime();

  switch (cadence) {
    case 'daily':
      return msSinceLast >= 23 * 60 * 60 * 1000; // 23h
    case 'weekly':
      return msSinceLast >= 6 * 24 * 60 * 60 * 1000; // 6 days
    case 'bi-weekly':
      return msSinceLast >= 13 * 24 * 60 * 60 * 1000; // 13 days
    case 'monthly':
      return msSinceLast >= 28 * 24 * 60 * 60 * 1000; // 28 days
    case 'custom':
    default:
      return msSinceLast >= 23 * 60 * 60 * 1000; // treat as daily
  }
}
