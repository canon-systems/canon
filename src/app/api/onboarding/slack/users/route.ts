import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listSlackUsersForOrganization } from '@/lib/server/integrations/slack-users';
import { requireWorkspace } from '@/lib/server/organization';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { organization } = await requireWorkspace(user);
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
