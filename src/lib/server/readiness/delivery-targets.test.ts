import { describe, expect, it } from 'vitest';

import {
  deliveryTargetRows,
  isReadinessDeliveryProvider,
  validDeliveryTargets,
  validSlackChannelIds,
  validSlackDmTargets,
} from './delivery-targets';

describe('readiness delivery target parsing', () => {
  it('validates Slack channel and DM target ids', () => {
    expect(validSlackChannelIds([' C123 ', 'G456', 'D789', '', null])).toEqual(['C123', 'G456']);
    expect(validSlackDmTargets([' U123 ', 'D456', 'USLACKBOT', 'C789', undefined])).toEqual(['U123', 'D456']);
  });

  it('narrows supported delivery providers', () => {
    expect(isReadinessDeliveryProvider('slack')).toBe(true);
    expect(isReadinessDeliveryProvider('teams')).toBe(true);
    expect(isReadinessDeliveryProvider('email')).toBe(false);
  });

  it('normalizes camelCase and snake_case delivery target payloads', () => {
    expect(validDeliveryTargets([
      { provider: 'slack', targetType: 'channel', targetId: ' C123 ', targetName: ' sales ', enabled: true },
      { provider: 'teams', target_type: 'dm', target_id: ' chat_123 ', target_name: '', enabled: false },
      { provider: 'email', targetType: 'channel', targetId: 'bad' },
      { provider: 'slack', targetType: 'thread', targetId: 'bad' },
    ])).toEqual([
      {
        provider: 'slack',
        targetType: 'channel',
        targetId: 'C123',
        targetName: 'sales',
        enabled: true,
      },
      {
        provider: 'teams',
        targetType: 'dm',
        targetId: 'chat_123',
        targetName: null,
        enabled: false,
      },
    ]);
  });

  it('builds database row inputs with organization ownership', () => {
    expect(deliveryTargetRows([
      { provider: 'google_chat', targetType: 'channel', targetId: 'spaces/AAAA', targetName: 'Customer updates' },
    ], 'org_123')).toEqual([
      {
        organization_id: 'org_123',
        provider: 'google_chat',
        target_type: 'channel',
        target_id: 'spaces/AAAA',
        target_name: 'Customer updates',
        enabled: true,
      },
    ]);
  });
});
