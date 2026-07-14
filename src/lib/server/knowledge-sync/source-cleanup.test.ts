import { describe, expect, it } from 'vitest';

import { unavailableSlackKnowledgeSourceIds } from './source-cleanup';

describe('knowledge source cleanup', () => {
  it('finds saved Slack sources whose channels are no longer available', () => {
    const staleIds = unavailableSlackKnowledgeSourceIds(
      [
        { id: 'source_active', provider: 'slack', slack_channel_id: 'C_ACTIVE' },
        { id: 'source_deleted', provider: 'slack', slack_channel_id: 'C_DELETED' },
        { id: 'source_granola', provider: 'granola', slack_channel_id: null },
        { id: 'source_teams', provider: 'teams', slack_channel_id: 'team/channel' },
      ],
      new Set(['C_ACTIVE'])
    );

    expect(staleIds).toEqual(['source_deleted']);
  });
});
