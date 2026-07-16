const MANAGER_CHAT_PROVIDERS = ['slack', 'teams', 'google_chat', 'email'] as const;

export type ManagerChatProvider = (typeof MANAGER_CHAT_PROVIDERS)[number];

export type ManagerCommunicationInput = {
  manager_name?: unknown;
  manager_email?: unknown;
  manager_slack_user_id?: unknown;
  manager_chat_provider?: unknown;
  manager_chat_target_id?: unknown;
};

export type ManagerCommunicationPatch = {
  manager_name: string;
  manager_email: string | null;
  manager_slack_user_id: string | null;
  manager_chat_provider: ManagerChatProvider;
  manager_chat_target_id: string | null;
};

export type ManagerAssignableHire = {
  manager_slack_user_id?: string | null;
  manager_chat_provider?: string | null;
  manager_chat_target_id?: string | null;
};

export type ManagerSlackUser = {
  id: string;
  name: string;
  email: string | null;
};

function isManagerChatProvider(value: unknown): value is ManagerChatProvider {
  return typeof value === 'string' && (MANAGER_CHAT_PROVIDERS as readonly string[]).includes(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function hasManagerCommunicationTarget(input: ManagerCommunicationInput) {
  const provider = isManagerChatProvider(input.manager_chat_provider)
    ? input.manager_chat_provider
    : 'slack';

  if (provider === 'email') return Boolean(optionalString(input.manager_email));
  return Boolean(optionalString(input.manager_chat_target_id) ?? optionalString(input.manager_slack_user_id));
}

export function normalizeManagerCommunication(input: ManagerCommunicationInput): ManagerCommunicationPatch {
  const provider = isManagerChatProvider(input.manager_chat_provider)
    ? input.manager_chat_provider
    : 'slack';
  const managerName = optionalString(input.manager_name);
  const managerEmail = optionalString(input.manager_email);
  const managerSlackUserId = optionalString(input.manager_slack_user_id);
  const managerChatTargetId = optionalString(input.manager_chat_target_id);

  if (!managerName) {
    throw new Error('Manager name is required');
  }

  if (provider === 'slack') {
    const slackTarget = managerChatTargetId ?? managerSlackUserId;
    if (!slackTarget) {
      throw new Error('Manager Slack contact is required');
    }
    return {
      manager_name: managerName,
      manager_email: managerEmail,
      manager_slack_user_id: slackTarget,
      manager_chat_provider: provider,
      manager_chat_target_id: slackTarget,
    };
  }

  if (provider === 'email' && !managerEmail) {
    throw new Error('Manager email is required');
  }

  return {
    manager_name: managerName,
    manager_email: managerEmail,
    manager_slack_user_id: managerSlackUserId,
    manager_chat_provider: provider,
    manager_chat_target_id: managerChatTargetId,
  };
}

export function slackReviewTargetsForHire(
  hire: ManagerAssignableHire,
  fallbackTargets: string[] = []
) {
  const provider = isManagerChatProvider(hire.manager_chat_provider)
    ? hire.manager_chat_provider
    : 'slack';
  const assignedTarget = optionalString(hire.manager_chat_target_id) ?? optionalString(hire.manager_slack_user_id);

  if (provider === 'slack' && assignedTarget) {
    return [assignedTarget];
  }

  return Array.from(new Set(fallbackTargets.filter((target) => target.trim().length > 0)));
}

export function slackUserToManagerFields(user: ManagerSlackUser | null) {
  return {
    manager_name: user?.name ?? '',
    manager_email: user?.email ?? '',
    manager_slack_user_id: user?.id ?? '',
    manager_chat_provider: 'slack' as const,
    manager_chat_target_id: user?.id ?? '',
  };
}
