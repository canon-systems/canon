import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createNangoConnectSession, nangoIntegrationForProvider, resolveNangoWebhookUrl } from '@/lib/server/integrations/nango';
import { createLogger, errorMessage } from '@/lib/server/logging';
import { requireWorkspace } from '@/lib/server/organization';
import { userFullName } from '@/lib/userDisplay';

export const runtime = 'nodejs';

const log = createLogger('api.integrations.nango.connect', {
  label: 'Nango Connect',
  eventLabels: {
    connect_session_requested: 'Connect Session Requested',
    connect_session_created: 'Connect Session Created',
    connect_session_failed: 'Connect Session Failed',
  },
});

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { provider?: string };
    const provider = typeof body.provider === 'string' ? body.provider.trim().toLowerCase() : '';
    const integration = nangoIntegrationForProvider(provider);
    if (!provider || !integration) {
      return NextResponse.json({ error: 'Unsupported Nango provider' }, { status: 400 });
    }

    const { organization } = await requireWorkspace(user);
    const webhookUrl = resolveNangoWebhookUrl(request.nextUrl.origin);

    log.info('connect_session_requested', {
      userId: user.id,
      organizationId: organization.id,
      provider,
      integrationId: integration.integrationId,
      webhookUrl: webhookUrl ?? 'environment_default',
    });

    const session = await createNangoConnectSession({
      provider,
      userId: user.id,
      userEmail: user.email,
      userDisplayName: userFullName(user),
      organizationId: organization.id,
      organizationName: organization.name,
      webhookUrl,
    });

    log.info('connect_session_created', {
      userId: user.id,
      organizationId: organization.id,
      provider,
      integrationId: session.integrationId,
      expiresAt: session.expiresAt,
    });

    return NextResponse.json({
      token: session.token,
      connectLink: session.connectLink,
      expiresAt: session.expiresAt,
      integrationId: session.integrationId,
    });
  } catch (error) {
    const detail = errorMessage(error);
    log.error('connect_session_failed', { error: detail });
    const status = detail.includes('NANGO_API_KEY') ? 503 : 500;
    return NextResponse.json({ error: 'Failed to create Nango connect session', detail }, { status });
  }
}
