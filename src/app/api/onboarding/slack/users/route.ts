import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listSlackUsersForOrganization } from '@/lib/server/integrations/slack-users';
import { isDemoOrganization, requireWorkspace } from '@/lib/server/organization';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { organization } = await requireWorkspace(user);
    if (isDemoOrganization(organization)) {
      return NextResponse.json({
        users: [
          { id: 'UDEMO_MAYA', name: 'Maya Chen', email: 'maya.chen@novara.cloud' },
          { id: 'UDEMO_JORDAN', name: 'Jordan Brooks', email: 'jordan.brooks@novara.cloud' },
          { id: 'UDEMO_PRIYA', name: 'Priya Raman', email: 'priya.raman@novara.cloud' },
          { id: 'UDEMO_ELENA', name: 'Elena Torres', email: 'elena.torres@novara.cloud' },
          { id: 'UDEMO_SAMIRA', name: 'Samira Patel', email: 'samira.patel@novara.cloud' },
          { id: 'UDEMO_MARCUS', name: 'Marcus Lee', email: 'marcus.lee@novara.cloud' },
          { id: 'UDEMO_OLIVIA', name: 'Olivia Grant', email: 'olivia.grant@novara.cloud' },
          { id: 'UDEMO_DANIEL', name: 'Daniel Kim', email: 'daniel.kim@novara.cloud' },
        ],
        reconnect_required: false,
        missing_scopes: [],
        provided_scopes: ['users:read', 'users:read.email'],
      });
    }
    const result = await listSlackUsersForOrganization(organization.id);
    return NextResponse.json({
      users: result.users,
      reconnect_required: result.reconnectRequired,
      missing_scopes: result.missingScopes,
      provided_scopes: result.providedScopes,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/slack/users] GET failed', error);
    return NextResponse.json({ error: 'Failed to load Slack users', detail: message }, { status: 500 });
  }
}
