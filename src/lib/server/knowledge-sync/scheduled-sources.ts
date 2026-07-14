export type ScheduledKnowledgeSourceCandidate = {
  provider: string;
  name: string | null;
  slack_channel_id: string | null;
};

export const scheduledSyncProviders = ['slack', 'granola'] as const;

export function isScheduledKnowledgeSourceSyncable(source: ScheduledKnowledgeSourceCandidate) {
  return (
    source.provider === 'granola' ||
    (source.provider === 'slack' && !!source.slack_channel_id)
  );
}
