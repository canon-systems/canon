export const MEETING_PREP_CHECK_INTERVAL_MINUTES = 5;

export function meetingPrepWindow(params: {
  now: Date;
  minutesBefore: number;
}) {
  return {
    earliestStart: params.now,
    latestStart: new Date(params.now.getTime() + Math.max(MEETING_PREP_CHECK_INTERVAL_MINUTES, params.minutesBefore) * 60 * 1000),
  };
}

export function shouldAttemptMeetingPrep(status: string | null | undefined, attemptCount = 0) {
  return attemptCount < 3 && (!status || status === 'pending' || status === 'failed');
}
