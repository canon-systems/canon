type SlackKnowledgeSource = {
  id: string;
  provider: string;
  slack_channel_id: string | null;
};

export function unavailableSlackKnowledgeSourceIds(
  sources: SlackKnowledgeSource[],
  currentSlackChannelIds: Set<string>
) {
  return sources
    .filter((source) => (
      source.provider === 'slack' &&
      typeof source.slack_channel_id === 'string' &&
      source.slack_channel_id.length > 0 &&
      !currentSlackChannelIds.has(source.slack_channel_id)
    ))
    .map((source) => source.id);
}
