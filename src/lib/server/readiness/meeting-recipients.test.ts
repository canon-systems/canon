import { describe, expect, it } from 'vitest';
import { deliveryTargetsForMeetingAttendees } from './meeting-recipients';

describe('deliveryTargetsForMeetingAttendees', () => {
  it('matches attendee emails without case sensitivity and ignores external attendees', () => {
    const targets = deliveryTargetsForMeetingAttendees({
      organizationId: 'org-1',
      attendeeEmails: ['ALEX@example.com', 'customer@outside.com'],
      directoryUsers: [
        { provider: 'slack', targetId: 'U1', targetName: 'Alex', email: 'alex@example.com' },
        { provider: 'slack', targetId: 'U2', targetName: 'Sam', email: 'sam@example.com' },
      ],
    });

    expect(targets).toEqual([expect.objectContaining({
      provider: 'slack',
      target_id: 'U1',
      target_name: 'Alex',
      target_type: 'dm',
    })]);
  });

  it('deduplicates recipients within each communication provider', () => {
    const targets = deliveryTargetsForMeetingAttendees({
      organizationId: 'org-1',
      attendeeEmails: ['alex@example.com', 'alex@example.com'],
      directoryUsers: [
        { provider: 'slack', targetId: 'U1', targetName: 'Alex', email: 'alex@example.com' },
        { provider: 'slack', targetId: 'U1', targetName: 'Alex duplicate', email: 'alex@example.com' },
        { provider: 'teams', targetId: 'chat-1', targetName: 'Alex', email: 'alex@example.com' },
      ],
    });

    expect(targets).toEqual([
      expect.objectContaining({ provider: 'slack', target_id: 'U1' }),
      expect.objectContaining({ provider: 'teams', target_id: 'chat-1' }),
    ]);
  });
});
