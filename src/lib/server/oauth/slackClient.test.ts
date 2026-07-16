import { describe, expect, it } from 'vitest';
import { getSlackOAuthScopes } from './slackClient';

describe('getSlackOAuthScopes', () => {
  it('requests both Slack directory scopes needed for profile emails', () => {
    expect(getSlackOAuthScopes()).toEqual(expect.arrayContaining([
      'users:read',
      'users:read.email',
    ]));
  });
});
