import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      cloudId?: string;
      siteUrl?: string;
      siteName?: string;
    };

    const cloudId = body.cloudId?.trim() || '';
    if (!cloudId) {
      return NextResponse.json({ error: 'cloudId is required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: connection, error } = await supabase
      .from('oauth_connections')
      .select('connection_id, metadata')
      .eq('user_id', user.id)
      .eq('provider', 'confluence')
      .eq('status', 'active')
      .maybeSingle();

    if (error) throw error;
    if (!connection?.connection_id) {
      return NextResponse.json({ error: 'Jira connection not found' }, { status: 404 });
    }

    const metadata = connection?.metadata && typeof connection.metadata === 'object'
      ? { ...(connection.metadata as Record<string, unknown>) }
      : {};

    metadata.jira_cloud_id = cloudId;
    if (body.siteUrl) metadata.jira_site_url = body.siteUrl;
    if (body.siteName) metadata.jira_site_name = body.siteName;

    const { error: updateError } = await supabase
      .from('oauth_connections')
      .update({ metadata })
      .eq('connection_id', connection.connection_id);

    if (updateError) throw updateError;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Failed to save Jira workspace:', err);
    return NextResponse.json(
      { error: 'Failed to save Jira workspace', detail: err.message || String(err) },
      { status: 500 }
    );
  }
}
