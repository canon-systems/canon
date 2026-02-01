/**
 * Cadence helpers for report_schedules.
 * Scheduling is handled by RRULE + Inngest (reportScheduleTick). This module provides
 * the primary time window for diff reports; baseline is computed via computeBaselineWindow
 * (same as Knowledge page compare). All times are UTC.
 */

function toISO(date: Date): string {
  return date.toISOString();
}

/**
 * Returns the primary window { start, end } in ISO format for the given cadence.
 * Matches how the Knowledge page diff works: primary is the report period, baseline
 * is computed separately via computeBaselineWindow(primary.start, primary.end).
 *
 * - daily: current day (today 00:00 → 23:59:59 UTC)
 * - weekly: 7 days ending yesterday (e.g. Jan 25 00:00 → Jan 31 23:59:59 UTC)
 * - monthly: previous full calendar month (e.g. Jan 1 00:00 → Jan 31 23:59:59 UTC)
 */
export function getWindowForCadence(cadence: string, now: Date = new Date()): { start: string; end: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();

  let start: Date;
  let end: Date;

  switch (cadence) {
    case 'daily': {
      // Primary = current day (today 00:00 → 23:59:59 UTC)
      start = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
      end = new Date(Date.UTC(y, m, d, 23, 59, 59, 999));
      break;
    }
    case 'weekly': {
      // Primary = 7 days ending yesterday (e.g. Jan 25 00:00 → Jan 31 23:59:59 UTC)
      const yesterday = new Date(Date.UTC(y, m, d, 23, 59, 59, 999));
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const endY = yesterday.getUTCFullYear();
      const endM = yesterday.getUTCMonth();
      const endD = yesterday.getUTCDate();
      end = new Date(Date.UTC(endY, endM, endD, 23, 59, 59, 999));
      start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 6);
      start.setUTCHours(0, 0, 0, 0);
      break;
    }
    case 'monthly': {
      // Primary = previous full calendar month (e.g. Jan 1 00:00 → Jan 31 23:59:59 UTC)
      const prevMonth = m === 0 ? 11 : m - 1;
      const prevYear = m === 0 ? y - 1 : y;
      start = new Date(Date.UTC(prevYear, prevMonth, 1, 0, 0, 0, 0));
      // Last day of previous month
      end = new Date(Date.UTC(prevYear, prevMonth + 1, 0, 23, 59, 59, 999));
      break;
    }
    default: {
      // Unknown cadence: 7 days ending yesterday (same shape as weekly)
      const yesterday = new Date(Date.UTC(y, m, d, 23, 59, 59, 999));
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const endY = yesterday.getUTCFullYear();
      const endM = yesterday.getUTCMonth();
      const endD = yesterday.getUTCDate();
      end = new Date(Date.UTC(endY, endM, endD, 23, 59, 59, 999));
      start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 6);
      start.setUTCHours(0, 0, 0, 0);
      break;
    }
  }

  return { start: toISO(start), end: toISO(end) };
}
