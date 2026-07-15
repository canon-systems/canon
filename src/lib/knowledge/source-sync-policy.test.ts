import { describe, expect, it } from 'vitest';

import {
  SOURCE_SYNC_LOOKBACK_DAYS,
  SOURCE_SYNC_MESSAGE_ITEM_LIMIT,
  SOURCE_SYNC_MESSAGE_THREAD_REPLY_LIMIT,
  SOURCE_SYNC_TRANSCRIPT_ITEM_LIMIT,
  defaultSourceSyncPolicy,
  sourceSyncPolicyLabel,
} from './source-sync-policy';

describe('source sync policy', () => {
  it('uses a 180-day, high-volume message policy for chat sources', () => {
    expect(defaultSourceSyncPolicy('slack')).toEqual({
      syncWindowDays: SOURCE_SYNC_LOOKBACK_DAYS,
      syncItemLimit: SOURCE_SYNC_MESSAGE_ITEM_LIMIT,
    });
    expect(defaultSourceSyncPolicy('teams')).toEqual({
      syncWindowDays: SOURCE_SYNC_LOOKBACK_DAYS,
      syncItemLimit: SOURCE_SYNC_MESSAGE_ITEM_LIMIT,
    });
    expect(SOURCE_SYNC_MESSAGE_THREAD_REPLY_LIMIT).toBe(25);
  });

  it('uses the same lookback with a transcript-sized cap for Granola', () => {
    expect(defaultSourceSyncPolicy('granola')).toEqual({
      syncWindowDays: SOURCE_SYNC_LOOKBACK_DAYS,
      syncItemLimit: SOURCE_SYNC_TRANSCRIPT_ITEM_LIMIT,
    });
    expect(sourceSyncPolicyLabel('granola')).toBe(`180 days or latest ${SOURCE_SYNC_TRANSCRIPT_ITEM_LIMIT} transcripts`);
  });

  it('falls back to the message policy for unknown providers', () => {
    expect(defaultSourceSyncPolicy('unknown')).toEqual({
      syncWindowDays: SOURCE_SYNC_LOOKBACK_DAYS,
      syncItemLimit: SOURCE_SYNC_MESSAGE_ITEM_LIMIT,
    });
  });
});
