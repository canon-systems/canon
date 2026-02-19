import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { trackIntegrationStateChanged } from '@/lib/server/services/usageTracking';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const installationId = searchParams.get('installation_id');
  const setupAction = searchParams.get('setup_action');

  const { user } = await getSession();
  if (!user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (installationId) {
    const supabase = await createClient();
    await supabase
      .from('oauth_connections')
      .upsert(
        {
          user_id: user.id,
          provider: 'github',
          connection_id: String(installationId),
          status: 'active',
          metadata: {
            source: 'github_app',
            installation_id: String(installationId),
            setup_action: setupAction,
            connected_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,provider' }
      );
    await trackIntegrationStateChanged(supabase, user.id, 'connected', 'github', String(installationId));
  }

  const redirectUrl = new URL('/settings', request.url);
  redirectUrl.searchParams.set('tab', 'integrations');
  redirectUrl.searchParams.set('installed', 'true');

  if (installationId) {
    redirectUrl.searchParams.set('installation_id', installationId);
  }
  if (setupAction) {
    redirectUrl.searchParams.set('setup_action', setupAction);
  }

  return NextResponse.redirect(redirectUrl);
}
