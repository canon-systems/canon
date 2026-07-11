export type SlackChannelOption = {
  id: string;
  name: string;
  member_count: number;
  topic: string;
};

type SlackChannelRaw = {
  id: string;
  name: string;
  num_members?: number;
  topic?: { value?: string };
};

type SlackConversationsListResponse = {
  ok: boolean;
  error?: string;
  needed?: string;
  provided?: string;
  channels?: SlackChannelRaw[];
  response_metadata?: { next_cursor?: string };
};

export class SlackListChannelsError extends Error {
  detail?: string;
  needed?: string;
  provided?: string;

  constructor(params: { message: string; detail?: string; needed?: string; provided?: string }) {
    super(params.message);
    this.name = 'SlackListChannelsError';
    this.detail = params.detail;
    this.needed = params.needed;
    this.provided = params.provided;
  }
}

export async function listSlackChannels(accessToken: string): Promise<SlackChannelOption[]> {
  const channels: SlackChannelOption[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({ limit: '200', exclude_archived: 'true', types: 'public_channel' });
    if (cursor) params.set('cursor', cursor);

    const res = await fetch(`https://slack.com/api/conversations.list?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = (await res.json()) as SlackConversationsListResponse;

    if (!data.ok || !data.channels) {
      throw new SlackListChannelsError({
        message: 'Slack API failed to list channels',
        detail: data.error ?? 'unknown_error',
        needed: data.needed,
        provided: data.provided,
      });
    }

    channels.push(
      ...data.channels.map((channel) => ({
        id: channel.id,
        name: channel.name,
        member_count: channel.num_members ?? 0,
        topic: channel.topic?.value ?? '',
      }))
    );

    cursor = data.response_metadata?.next_cursor || undefined;
  } while (cursor && channels.length < 1000);

  return channels.sort((a, b) => a.name.localeCompare(b.name));
}
