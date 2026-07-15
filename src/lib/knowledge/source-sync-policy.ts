import type { KnowledgeProvider } from '@/types/onboarding';

export type SourceSyncPolicy = {
  syncWindowDays: number;
  syncItemLimit: number;
};

export const SOURCE_SYNC_LOOKBACK_DAYS = 180;
export const SOURCE_SYNC_MESSAGE_ITEM_LIMIT = 5000;
export const SOURCE_SYNC_TRANSCRIPT_ITEM_LIMIT = 1000;
export const SOURCE_SYNC_MESSAGE_THREAD_REPLY_LIMIT = 25;

const SOURCE_SYNC_CALENDAR_ITEM_LIMIT = 200;
const SOURCE_SYNC_CALENDAR_WINDOW_DAYS = 14;

const DEFAULT_SOURCE_SYNC_POLICIES: Partial<Record<KnowledgeProvider, SourceSyncPolicy>> = {
  slack: { syncWindowDays: SOURCE_SYNC_LOOKBACK_DAYS, syncItemLimit: SOURCE_SYNC_MESSAGE_ITEM_LIMIT },
  teams: { syncWindowDays: SOURCE_SYNC_LOOKBACK_DAYS, syncItemLimit: SOURCE_SYNC_MESSAGE_ITEM_LIMIT },
  granola: { syncWindowDays: SOURCE_SYNC_LOOKBACK_DAYS, syncItemLimit: SOURCE_SYNC_TRANSCRIPT_ITEM_LIMIT },
  google_calendar: { syncWindowDays: SOURCE_SYNC_CALENDAR_WINDOW_DAYS, syncItemLimit: SOURCE_SYNC_CALENDAR_ITEM_LIMIT },
  outlook: { syncWindowDays: SOURCE_SYNC_CALENDAR_WINDOW_DAYS, syncItemLimit: SOURCE_SYNC_CALENDAR_ITEM_LIMIT },
};

const FALLBACK_POLICY: SourceSyncPolicy = { syncWindowDays: SOURCE_SYNC_LOOKBACK_DAYS, syncItemLimit: SOURCE_SYNC_MESSAGE_ITEM_LIMIT };

export function defaultSourceSyncPolicy(provider: string | null | undefined): SourceSyncPolicy {
  const key = (provider ?? '').trim().toLowerCase() as KnowledgeProvider;
  return DEFAULT_SOURCE_SYNC_POLICIES[key] ?? FALLBACK_POLICY;
}

export function sourceSyncPolicyLabel(provider: string, policy = defaultSourceSyncPolicy(provider)) {
  const key = provider.trim().toLowerCase();
  if (key === 'granola') return `${policy.syncWindowDays} days or latest ${policy.syncItemLimit} transcripts`;
  if (key === 'slack' || key === 'teams') return `${policy.syncWindowDays} days or latest ${policy.syncItemLimit} messages`;
  if (key === 'google_calendar' || key === 'outlook') return `next ${policy.syncWindowDays} days`;
  return `${policy.syncWindowDays} days or latest ${policy.syncItemLimit} items`;
}
