/**
 * Cadence helpers for report_schedules.
 * Scheduling is handled by RRULE + Inngest (reportScheduleTick). This module only provides
 * the time window for diff/projection runs (e.g. "last 7 days" for weekly).
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
    case 'monthly':
      start.setMonth(start.getMonth() - 1);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    default:
      // Unknown cadence: default to last 7 days
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      break;
  }

  return { start: toISO(start), end: toISO(end) };
}
