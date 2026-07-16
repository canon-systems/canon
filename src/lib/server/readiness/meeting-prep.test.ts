import { describe, expect, it } from 'vitest';
import { meetingPrepWindow, shouldAttemptMeetingPrep } from './meeting-prep';

describe('meetingPrepWindow', () => {
  it('starts checking at the configured lead time and keeps a recovery window open', () => {
    const now = new Date('2026-07-15T12:00:00.000Z');
    const result = meetingPrepWindow({ now, minutesBefore: 45 });

    expect(result.earliestStart.toISOString()).toBe('2026-07-15T12:00:00.000Z');
    expect(result.latestStart.toISOString()).toBe('2026-07-15T12:45:00.000Z');
  });

  it('includes meetings starting within five minutes at the minimum lead time', () => {
    const now = new Date('2026-07-15T12:00:00.000Z');
    const result = meetingPrepWindow({ now, minutesBefore: 5 });

    expect(result.earliestStart.toISOString()).toBe('2026-07-15T12:00:00.000Z');
    expect(result.latestStart.toISOString()).toBe('2026-07-15T12:05:00.000Z');
  });
});

describe('shouldAttemptMeetingPrep', () => {
  it('retries incomplete deliveries without repeating finished ones', () => {
    expect(shouldAttemptMeetingPrep(null)).toBe(true);
    expect(shouldAttemptMeetingPrep('pending')).toBe(true);
    expect(shouldAttemptMeetingPrep('failed')).toBe(true);
    expect(shouldAttemptMeetingPrep('failed', 3)).toBe(false);
    expect(shouldAttemptMeetingPrep('delivered')).toBe(false);
    expect(shouldAttemptMeetingPrep('skipped')).toBe(false);
  });
});
