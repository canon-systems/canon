import { describe, expect, it } from 'vitest';

import {
  normalizeManagerCommunication,
  slackReviewTargetsForHire,
  slackUserToManagerFields,
} from './manager-communication';

describe('manager communication rules', () => {
  it('normalizes Slack manager contact into the active review target', () => {
    expect(normalizeManagerCommunication({
      manager_name: ' Jordan Lee ',
      manager_email: 'jordan@example.com',
      manager_slack_user_id: ' U123 ',
      manager_chat_provider: 'slack',
    })).toEqual({
      manager_name: 'Jordan Lee',
      manager_email: 'jordan@example.com',
      manager_slack_user_id: 'U123',
      manager_chat_provider: 'slack',
      manager_chat_target_id: 'U123',
    });
  });

  it('requires a Slack target for Slack manager review', () => {
    expect(() => normalizeManagerCommunication({
      manager_name: 'Jordan Lee',
      manager_chat_provider: 'slack',
    })).toThrow('Manager Slack contact is required');
  });

  it('routes review to the assigned manager before org fallback recipients', () => {
    expect(slackReviewTargetsForHire({
      manager_slack_user_id: 'U_MANAGER',
      manager_chat_provider: 'slack',
      manager_chat_target_id: null,
    }, ['U_FALLBACK'])).toEqual(['U_MANAGER']);
  });

  it('uses fallback Slack reviewers when the manager uses a future channel', () => {
    expect(slackReviewTargetsForHire({
      manager_slack_user_id: 'U_MANAGER',
      manager_chat_provider: 'teams',
      manager_chat_target_id: 'teams-user',
    }, ['U_FALLBACK', 'U_FALLBACK'])).toEqual(['U_FALLBACK']);
  });

  it('maps selected Slack users into manager form fields', () => {
    expect(slackUserToManagerFields({
      id: 'U123',
      name: 'Jordan Lee',
      email: null,
    })).toEqual({
      manager_name: 'Jordan Lee',
      manager_email: '',
      manager_slack_user_id: 'U123',
      manager_chat_provider: 'slack',
      manager_chat_target_id: 'U123',
    });
  });
});
