import { listSlackUsersForOrganization } from '@/lib/server/integrations/slack-users';
import type { MeetingRecipientDirectoryUser } from '@/lib/server/readiness/meeting-recipients';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { ReadinessDeliveryProvider } from '@/types/onboarding';

export type CommunicationDirectoryIssue = {
  provider: ReadinessDeliveryProvider;
  reason: 'reconnect_required';
  missingScopes: string[];
};

export type CommunicationDirectoryResult = {
  users: MeetingRecipientDirectoryUser[];
  issues: CommunicationDirectoryIssue[];
};

type CommunicationDirectoryAdapter = {
  provider: ReadinessDeliveryProvider;
  listUsers(organizationId: string): Promise<CommunicationDirectoryResult>;
};

const slackDirectoryAdapter: CommunicationDirectoryAdapter = {
  provider: 'slack',
  async listUsers(organizationId) {
    const result = await listSlackUsersForOrganization(organizationId);
    if (result.reconnectRequired) {
      return {
        users: [],
        issues: [{
          provider: 'slack',
          reason: 'reconnect_required',
          missingScopes: result.missingScopes,
        }],
      };
    }

    return {
      users: result.users.map((user) => ({
        provider: 'slack',
        targetId: user.id,
        targetName: user.name,
        email: user.email,
      })),
      issues: [],
    };
  },
};

// Add future Teams or Google Chat directory adapters here. Recipient matching
// and meeting-prep orchestration do not depend on a provider-specific API.
const meetingRecipientDirectoryAdapters: CommunicationDirectoryAdapter[] = [
  slackDirectoryAdapter,
];

export function meetingRecipientDirectoryProviders() {
  return meetingRecipientDirectoryAdapters.map((adapter) => adapter.provider);
}

export async function listMeetingRecipientDirectory(
  organizationId: string
): Promise<CommunicationDirectoryResult> {
  const providers = meetingRecipientDirectoryProviders();
  const supabase = createServiceRoleClient();
  const { data: connections, error } = await supabase
    .from('oauth_connections')
    .select('provider')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .in('provider', providers);

  if (error) throw error;
  const connectedProviders = new Set((connections ?? []).map((connection) => connection.provider));
  const activeAdapters = meetingRecipientDirectoryAdapters.filter((adapter) => (
    connectedProviders.has(adapter.provider)
  ));
  const results = await Promise.all(
    activeAdapters.map((adapter) => adapter.listUsers(organizationId))
  );

  return {
    users: results.flatMap((result) => result.users),
    issues: results.flatMap((result) => result.issues),
  };
}
