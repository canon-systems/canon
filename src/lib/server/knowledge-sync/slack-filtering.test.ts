import { describe, expect, it } from 'vitest';

import { isCanonGeneratedSlackMessage, syncableSlackMessages } from './slack-filtering';
import type { SlackMessage } from './slack-client';

function message(overrides: Partial<SlackMessage>): SlackMessage {
  return {
    ts: '1710000000.000100',
    text: 'Customer asked whether the new audit log export supports workspace-level filters.',
    ...overrides,
  };
}

describe('Slack readiness source filtering', () => {
  it('keeps human Slack messages', () => {
    const human = message({ user: 'U123' });

    expect(isCanonGeneratedSlackMessage(human)).toBe(false);
    expect(syncableSlackMessages([human], 20)).toEqual([human]);
  });

  it('drops bot, app, and system messages', () => {
    expect(isCanonGeneratedSlackMessage(message({ bot_id: 'B123' }))).toBe(true);
    expect(isCanonGeneratedSlackMessage(message({ app_id: 'A123' }))).toBe(true);
    expect(isCanonGeneratedSlackMessage(message({ subtype: 'bot_message' }))).toBe(true);
  });

  it('drops Canon readiness output even when Slack metadata is missing', () => {
    const canonOutput = message({
      text: '*Weekly readiness digest*\n\n*Product Changes*\n• Update the talk track',
    });

    expect(isCanonGeneratedSlackMessage(canonOutput)).toBe(true);
    expect(syncableSlackMessages([canonOutput], 20)).toEqual([]);
  });
});
