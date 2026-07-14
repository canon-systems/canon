import { describe, expect, it } from 'vitest';

import { isScheduledKnowledgeSourceSyncable, scheduledSyncProviders } from './scheduled-sources';

describe('scheduled knowledge source sync', () => {
  it('includes all first-class source providers', () => {
    expect(scheduledSyncProviders).toEqual(['slack', 'teams', 'google_chat', 'granola']);
  });

  it('queues Slack, Teams, Google Chat, and Granola sources when they have enough target context', () => {
    expect(isScheduledKnowledgeSourceSyncable({ provider: 'slack', name: 'sales', slack_channel_id: 'C123' })).toBe(true);
    expect(isScheduledKnowledgeSourceSyncable({ provider: 'teams', name: 'General', slack_channel_id: 'team/channel' })).toBe(true);
    expect(isScheduledKnowledgeSourceSyncable({ provider: 'google_chat', name: 'spaces/AAAA', slack_channel_id: null })).toBe(true);
    expect(isScheduledKnowledgeSourceSyncable({ provider: 'granola', name: null, slack_channel_id: null })).toBe(true);
  });

  it('skips incomplete chat sources instead of queueing uncallable sync work', () => {
    expect(isScheduledKnowledgeSourceSyncable({ provider: 'slack', name: 'missing id', slack_channel_id: null })).toBe(false);
    expect(isScheduledKnowledgeSourceSyncable({ provider: 'teams', name: null, slack_channel_id: null })).toBe(false);
    expect(isScheduledKnowledgeSourceSyncable({ provider: 'google_chat', name: null, slack_channel_id: null })).toBe(false);
  });
});
