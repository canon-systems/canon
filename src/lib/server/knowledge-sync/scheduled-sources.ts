export type ScheduledKnowledgeSourceCandidate = {
  provider: string;
  name: string | null;
  slack_channel_id: string | null;
};

export const scheduledSyncProviders = ['slack', 'teams', 'google_chat', 'granola'] as const;

export function isScheduledKnowledgeSourceSyncable(source: ScheduledKnowledgeSourceCandidate) {
  return (
    source.provider === 'granola' ||
    (source.provider === 'slack' && !!source.slack_channel_id) ||
    (source.provider === 'teams' && (!!source.slack_channel_id || !!source.name)) ||
    (source.provider === 'google_chat' && (!!source.slack_channel_id || !!source.name))
  );
}
