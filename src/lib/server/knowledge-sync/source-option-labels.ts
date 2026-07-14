import type { KnowledgeProvider } from '@/types/onboarding';

export function sourceOptionTopic(provider: KnowledgeProvider, targetType?: string) {
  if (provider === 'granola') return 'Meeting transcripts';
  if (provider === 'teams') return targetType === 'dm' ? 'Teams chat' : 'Teams channel';
  if (provider === 'google_chat') return targetType === 'dm' ? 'Google Chat DM' : 'Google Chat space';
  return 'Slack channel';
}

export function isKnowledgeSourceTargetType(targetType: string | null | undefined) {
  return targetType === 'channel';
}
