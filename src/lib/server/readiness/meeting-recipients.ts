import type { ReadinessDeliveryTargetRow } from '@/lib/server/readiness/delivery';
import type { ReadinessDeliveryProvider } from '@/types/onboarding';

export type MeetingRecipientDirectoryUser = {
  provider: ReadinessDeliveryProvider;
  targetId: string;
  targetName: string | null;
  email: string | null;
};

export function deliveryTargetsForMeetingAttendees(params: {
  organizationId: string;
  attendeeEmails: string[];
  directoryUsers: MeetingRecipientDirectoryUser[];
}): ReadinessDeliveryTargetRow[] {
  const attendeeEmails = new Set(
    params.attendeeEmails.map((email) => email.trim().toLowerCase()).filter(Boolean)
  );
  const matchedTargets = new Set<string>();

  return params.directoryUsers.flatMap((user) => {
    const email = user.email?.trim().toLowerCase();
    const targetKey = `${user.provider}:${user.targetId}`;
    if (!email || !attendeeEmails.has(email) || matchedTargets.has(targetKey)) return [];
    matchedTargets.add(targetKey);

    return [{
      organization_id: params.organizationId,
      provider: user.provider,
      target_type: 'dm',
      target_id: user.targetId,
      target_name: user.targetName,
      enabled: true,
    }];
  });
}
