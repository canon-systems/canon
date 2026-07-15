import type { KnowledgeProvider } from '@/types/onboarding';

export function sourceOptionTopic(provider: KnowledgeProvider, targetType?: string) {
  if (provider === 'granola') return 'Meeting transcripts';
  if (provider === 'teams') return targetType === 'dm' ? 'Teams chat' : 'Teams channel';
  return 'Slack channel';
}

export function isKnowledgeSourceTargetType(targetType: string | null | undefined) {
  return targetType === 'channel';
}
