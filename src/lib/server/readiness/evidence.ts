import type { ReadinessSourceEventRow } from './source-events';

type SignalSourceCitation = {
  source_indexes: number[];
};

function slackMessageUrl(channelId: string, messageTs: string | null) {
  const params = new URLSearchParams({ channel: channelId });
  if (messageTs) params.set('message_ts', messageTs);
  return `https://slack.com/app_redirect?${params.toString()}`;
}

export function sourceEvidenceFromEvents(events: ReadinessSourceEventRow[]) {
  const seen = new Set<string>();
  return events.flatMap((event) => {
    const metadata = event.metadata ?? {};
    const provider = event.provider;
    const channelId = typeof metadata.channel_id === 'string' ? metadata.channel_id : null;
    const channelName = typeof metadata.channel_name === 'string' ? metadata.channel_name : null;
    const messageTs = typeof metadata.message_ts === 'string' ? metadata.message_ts : null;
    const sourceName = typeof metadata.source_name === 'string'
      ? metadata.source_name
      : typeof metadata.title === 'string'
        ? metadata.title
        : null;
    const sourceUrl = typeof metadata.source_url === 'string'
      ? metadata.source_url
      : typeof metadata.url === 'string'
        ? metadata.url
        : null;
    const sourceType = event.source_type;
    const noteId = typeof metadata.note_id === 'string' ? metadata.note_id : null;
    const meetingDate = typeof metadata.meeting_date === 'string' ? metadata.meeting_date : event.occurred_at;
    const key = `${provider}:${event.external_id}:${event.content_hash}`;

    if (seen.has(key)) return [];
    seen.add(key);

    return [{
      provider,
      channel_id: channelId,
      channel_name: channelName,
      message_ts: messageTs,
      source_name: sourceName,
      source_type: sourceType,
      note_id: noteId,
      meeting_date: meetingDate,
      url: sourceUrl ?? (channelId ? slackMessageUrl(channelId, messageTs) : null),
      source_event_id: event.id,
      content_hash: event.content_hash,
    }];
  });
}

export function citedEventsForSignal(signal: SignalSourceCitation, events: ReadinessSourceEventRow[]) {
  const selected = signal.source_indexes
    .map((sourceIndex) => events[sourceIndex - 1])
    .filter((event): event is ReadinessSourceEventRow => Boolean(event));
  const seen = new Set<string>();

  return selected.filter((event) => {
    if (seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  });
}
