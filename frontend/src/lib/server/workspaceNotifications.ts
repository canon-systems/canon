import type { SupabaseClient } from '@supabase/supabase-js';

type JoinRequestNotificationInput = {
  supabase: SupabaseClient;
  organization: {
    id: string;
    name: string;
    slug: string;
    owner_id: string | null;
  };
  requesterEmail: string;
  message: string | null;
  appOrigin: string;
};

function emailSender() {
  return process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || '';
}

export async function notifyWorkspaceOwnerOfJoinRequest({
  supabase,
  organization,
  requesterEmail,
  message,
  appOrigin,
}: JoinRequestNotificationInput) {
  if (!organization.owner_id) return;

  const apiKey = process.env.RESEND_API_KEY;
  const from = emailSender();
  if (!apiKey || !from) {
    console.info('[workspace-notifications] join request email skipped; email provider is not configured', {
      organizationId: organization.id,
      requesterEmail,
    });
    return;
  }

  const { data, error } = await supabase.auth.admin.getUserById(organization.owner_id);
  if (error || !data.user?.email) {
    console.warn('[workspace-notifications] join request email skipped; owner email unavailable', {
      organizationId: organization.id,
      ownerId: organization.owner_id,
      error: error?.message,
    });
    return;
  }

  const settingsUrl = new URL('/settings?tab=org', appOrigin).toString();
  const text = [
    `${requesterEmail} requested access to ${organization.name}.`,
    message ? `Message: ${message}` : '',
    `Review the request: ${settingsUrl}`,
  ].filter(Boolean).join('\n\n');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: data.user.email,
        subject: `${requesterEmail} requested access to ${organization.name}`,
        text,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.warn('[workspace-notifications] join request email failed', {
        organizationId: organization.id,
        status: response.status,
        detail,
      });
    }
  } catch (error) {
    console.warn('[workspace-notifications] join request email failed', {
      organizationId: organization.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
