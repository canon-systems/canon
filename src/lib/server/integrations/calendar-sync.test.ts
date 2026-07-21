import { describe, expect, it } from 'vitest';

import { calendarEventExternalId } from './calendar-sync';

describe('calendarEventExternalId', () => {
  it('scopes provider event IDs to the selected calendar source', () => {
    expect(calendarEventExternalId('source-1', 'event-1')).toBe('source-1:event-1');
    expect(calendarEventExternalId('source-2', 'event-1')).toBe('source-2:event-1');
  });

  it('preserves legacy default-calendar IDs before sources are configured', () => {
    expect(calendarEventExternalId(null, 'event-1')).toBe('event-1');
  });
});
