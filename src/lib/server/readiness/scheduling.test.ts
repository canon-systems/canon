import { describe, expect, it } from 'vitest';

import { weeklyDigestDue } from './scheduling';

describe('readiness digest scheduling', () => {
  const mondayAt13 = new Date('2026-07-13T13:15:00.000Z');

  it('runs when the saved weekly digest window is due', () => {
    expect(weeklyDigestDue({
      weeklyDigestEnabled: true,
      digestWeekday: 1,
      digestHourUtc: 13,
      lastDigestSentAt: null,
    }, mondayAt13)).toBe(true);
  });

  it('skips when disabled or outside the configured weekday/hour', () => {
    expect(weeklyDigestDue({
      weeklyDigestEnabled: false,
      digestWeekday: 1,
      digestHourUtc: 13,
      lastDigestSentAt: null,
    }, mondayAt13)).toBe(false);

    expect(weeklyDigestDue({
      weeklyDigestEnabled: true,
      digestWeekday: 2,
      digestHourUtc: 13,
      lastDigestSentAt: null,
    }, mondayAt13)).toBe(false);

    expect(weeklyDigestDue({
      weeklyDigestEnabled: true,
      digestWeekday: 1,
      digestHourUtc: 14,
      lastDigestSentAt: null,
    }, mondayAt13)).toBe(false);
  });

  it('does not send again inside the current weekly window', () => {
    expect(weeklyDigestDue({
      weeklyDigestEnabled: true,
      digestWeekday: 1,
      digestHourUtc: 13,
      lastDigestSentAt: '2026-07-12T13:00:00.000Z',
    }, mondayAt13)).toBe(false);
  });
});
