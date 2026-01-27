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
      projectKey?: string;
      name?: string;
      cloudId?: string;
      siteUrl?: string;
      siteName?: string;
    };

    const projectKey = body.projectKey?.trim() || '';

    if (!projectKey) {
      return NextResponse.json(
        { error: 'projectKey is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: connection } = await supabase
      .from('oauth_connections')
      .select('metadata')
      .eq('user_id', user.id)
      .eq('provider', 'confluence')
      .eq('status', 'active')
      .maybeSingle();

    const metadata = connection?.metadata && typeof connection.metadata === 'object'
      ? (connection.metadata as Record<string, unknown>)
      : {};
    const metadataCloudId = typeof metadata.cloud_id === 'string' ? metadata.cloud_id : null;
    const metadataJiraCloudId = typeof metadata.jira_cloud_id === 'string' ? metadata.jira_cloud_id : null;
    const metadataSiteUrl = typeof metadata.site_url === 'string' ? metadata.site_url : null;
    const metadataJiraSiteUrl = typeof metadata.jira_site_url === 'string' ? metadata.jira_site_url : null;

    const cloudId = body.cloudId?.trim()
      || metadataJiraCloudId
      || metadataCloudId
      || null;
    const siteUrl = body.siteUrl?.trim()
      || metadataJiraSiteUrl
      || metadataSiteUrl
      || null;

    if (!cloudId) {
      return NextResponse.json(
        { error: 'Jira connection not found' },
        { status: 404 }
      );
    }

    const name = body.name?.trim() || `Jira: ${projectKey}`;
    const repoUrl = siteUrl
      ? `${siteUrl.replace(/\/$/, '')}/browse/${projectKey}`
      : `jira://${cloudId}/${projectKey}`;

    const settings = {
      jira_project_key: projectKey || null,
      cloud_id: cloudId,
      site_url: siteUrl,
      site_name: body.siteName?.trim() || (typeof metadata.jira_site_name === 'string' ? metadata.jira_site_name : null),
    };

    const { data, error } = await supabase
      .from('workspace_sources')
      .insert({
        user_id: user.id,
        name,
        provider: 'jira',
        repo_url: repoUrl,
        external_url: repoUrl,
        default_branch: 'jira',
        auth_type: 'oauth',
        credentials_ref: null,
        settings,
        source_type: 'issue',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !data) {
      throw error || new Error('Failed to create Jira source');
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err: unknown) {
    console.error('Create Jira source error:', err);
    return NextResponse.json(
      { error: 'Failed to create Jira source', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
