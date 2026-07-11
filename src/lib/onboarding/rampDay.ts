const MS_PER_DAY = 24 * 60 * 60 * 1000;

function localDateFromInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function rampDayFromStartDate(startDate: string, now = new Date()): number {
  const parsedStart = localDateFromInput(startDate);
  if (!parsedStart) return 0;

  const elapsed = startOfLocalDay(now).getTime() - parsedStart.getTime();
  return Math.max(0, Math.floor(elapsed / MS_PER_DAY));
}
