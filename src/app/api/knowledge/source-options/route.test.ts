import { describe, expect, it } from 'vitest';

import { isKnowledgeSourceTargetType, sourceOptionTopic } from '@/lib/server/knowledge-sync/source-option-labels';

describe('knowledge source option labels', () => {
  it('uses provider-specific source type labels', () => {
    expect(sourceOptionTopic('slack')).toBe('Slack channel');
    expect(sourceOptionTopic('teams', 'channel')).toBe('Teams channel');
    expect(sourceOptionTopic('teams', 'dm')).toBe('Teams chat');
    expect(sourceOptionTopic('google_chat', 'channel')).toBe('Google Chat space');
    expect(sourceOptionTopic('google_chat', 'dm')).toBe('Google Chat DM');
    expect(sourceOptionTopic('granola')).toBe('Meeting transcripts');
  });

  it('only allows channel-like chat targets as knowledge sources', () => {
    expect(isKnowledgeSourceTargetType('channel')).toBe(true);
    expect(isKnowledgeSourceTargetType('dm')).toBe(false);
    expect(isKnowledgeSourceTargetType(undefined)).toBe(false);
  });
});
