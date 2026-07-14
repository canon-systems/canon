export type ReadinessDigestTimingConfig = {
  weeklyDigestEnabled: boolean;
  digestWeekday: number;
  digestHourUtc: number;
  lastDigestSentAt: string | null;
};

export function weeklyDigestDue(config: ReadinessDigestTimingConfig, now = new Date()) {
  if (!config.weeklyDigestEnabled) return false;
  if (now.getUTCDay() !== config.digestWeekday) return false;
  if (now.getUTCHours() !== config.digestHourUtc) return false;

  if (!config.lastDigestSentAt) return true;
  const lastSentAt = new Date(config.lastDigestSentAt);
  if (Number.isNaN(lastSentAt.getTime())) return true;

  const sixDaysMs = 6 * 24 * 60 * 60 * 1000;
  return now.getTime() - lastSentAt.getTime() >= sixDaysMs;
}
