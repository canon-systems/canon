import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { inngest } from '@/inngest/client';
import { INNGEST_EVENTS } from '@/inngest/constants';
import { canonicalProvider } from '@/lib/providers';
import { syncCalendarConnection } from '@/lib/server/integrations/calendar-sync';
import {
  listNangoConnectionsForOrganization,
  providerForNangoIntegration,
  supportedNangoProviders,
} from '@/lib/server/integrations/nango';
import { upsertWorkspaceConnection, type WorkspaceProvider } from '@/lib/server/integrations/workspaceConnections';
import { errorMessage } from '@/lib/server/logging';
import { requireWorkspace } from '@/lib/server/organization';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function findConnection(organizationId: string, connectionId: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const connections = await listNangoConnectionsForOrganization({ organizationId });
    const connection = connections.find((candidate) => candidate.connection_id === connectionId);
    if (connection) return connection;
    if (attempt < 3) await wait(250 * (attempt + 1));
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      provider?: unknown;
      connectionId?: unknown;
    };
    const provider = canonicalProvider(typeof body.provider === 'string' ? body.provider : '');
    const connectionId = typeof body.connectionId === 'string' ? body.connectionId.trim() : '';
    if (!supportedNangoProviders().includes(provider) || !connectionId) {
      return NextResponse.json({ error: 'Invalid integration connection' }, { status: 400 });
    }

    const { organization } = await requireWorkspace(user);
    const nangoConnection = await findConnection(organization.id, connectionId);
    if (!nangoConnection) {
      return NextResponse.json({ error: 'The new connection could not be confirmed' }, { status: 404 });
    }

    const connectedProvider = canonicalProvider(providerForNangoIntegration(nangoConnection.provider_config_key));
    if (connectedProvider !== provider) {
      return NextResponse.json({ error: 'The connected service did not match the requested service' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const metadata = {
      ...(nangoConnection.metadata ?? {}),
      source: 'nango',
      provider_config_key: nangoConnection.provider_config_key,
      nango_provider: nangoConnection.provider,
      nango_connection_id: nangoConnection.id,
      organization_id: organization.id,
      connected_at: new Date().toISOString(),
    };
    await upsertWorkspaceConnection(supabase, {
      organizationId: organization.id,
      connectedByUserId: user.id,
      provider: provider as WorkspaceProvider,
      connectionId,
      metadata,
    });

    if (provider !== 'google_calendar' && provider !== 'outlook') {
      return NextResponse.json({ connected: true });
    }

    try {
      const result = await syncCalendarConnection({
        supabase,
        connection: {
          organization_id: organization.id,
          provider,
          connection_id: connectionId,
          metadata,
        },
      });
      await inngest.send({
        name: INNGEST_EVENTS.MEETING_PREP_CHECK_REQUESTED,
        data: { organizationId: organization.id, reason: 'calendar_connected' },
      });
      return NextResponse.json({ connected: true, calendarSync: { status: 'ready', ...result } });
    } catch (syncError) {
      await inngest.send({
        name: INNGEST_EVENTS.CALENDAR_SYNC_REQUESTED,
        data: {
          organizationId: organization.id,
          provider,
          connectionId,
          reason: 'initial_calendar_sync_retry',
        },
      }).catch(() => undefined);
      return NextResponse.json({
        connected: true,
        calendarSync: { status: 'needs_attention', detail: errorMessage(syncError) },
      });
    }
  } catch (error) {
    return NextResponse.json({
      error: 'Unable to finish connecting this integration',
      detail: errorMessage(error),
    }, { status: 500 });
  }
}
