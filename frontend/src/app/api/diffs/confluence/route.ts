import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceProvider } from '@/lib/server/workspaces/workspaceFactory';
import type { WorkspaceInfo, WorkspaceContent } from '@/lib/server/workspaces/base';
import { trackPushToKb } from '@/lib/server/services/usageTracking';
import { parseRepoUrl } from '@/lib/server/github/github';
import { getGitHubDiffForRepo } from '@/lib/server/diff/githubDiff';
import { getJiraDiffForProject } from '@/lib/server/diff/jiraDiff';
import { buildCanonDiff } from '@/lib/server/diff/canon';
import { renderDiffMarkdown } from '@/lib/server/diff/renderers';

type DiffConfluenceRequest = {
  repoUrl: string;
  start_timestamp: string;
  end_timestamp: string;
  jiraProjectKey?: string | null;
  audiences?: Array<'eng' | 'gtm' | 'customers'>;
  title?: string;
  workspaceInfo?: {
    resourceId?: string | null;
    metadata?: Record<string, unknown> | null;
    html?: string | null;
  };
};

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as DiffConfluenceRequest;
    const { repoUrl, start_timestamp, end_timestamp, jiraProjectKey, audiences, title, workspaceInfo } = body;

    if (!repoUrl || !start_timestamp || !end_timestamp) {
      return NextResponse.json(
        { error: 'repoUrl, start_timestamp, and end_timestamp are required' },
        { status: 400 }
      );
    }

    const parsed = parseRepoUrl(repoUrl);
    if (!parsed) {
      return NextResponse.json({ error: 'Invalid GitHub repoUrl' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: connection } = await supabase
      .from('oauth_connections')
      .select('connection_id')
      .eq('user_id', user.id)
      .eq('provider', 'confluence')
      .eq('status', 'active')
      .single();

    if (!connection?.connection_id) {
      return NextResponse.json({ error: 'Confluence connection not found' }, { status: 404 });
    }

    const githubDiff = await getGitHubDiffForRepo({
      owner: parsed.owner,
      repo: parsed.repo,
      start: start_timestamp,
      end: end_timestamp,
    });

    const jiraDiff = jiraProjectKey
      ? await getJiraDiffForProject({
          userId: user.id,
          projectKey: jiraProjectKey ?? undefined,
          start: start_timestamp,
          end: end_timestamp,
        })
      : undefined;

    const canon = buildCanonDiff({
      start: start_timestamp,
      end: end_timestamp,
      github: githubDiff,
      jira: jiraDiff,
    });

    const markdown = renderDiffMarkdown(canon, {
      audiences,
      title,
    });

    const provider = getWorkspaceProvider('confluence');
    if (!provider) {
      return NextResponse.json({ error: 'Confluence provider unavailable' }, { status: 500 });
    }

    const workspace: WorkspaceInfo = {
      provider: 'confluence',
      resourceId: workspaceInfo?.resourceId || '',
      metadata: workspaceInfo?.metadata ?? undefined,
    };

    const content: WorkspaceContent = {
      title: title || 'Daily Activity Diff',
      markdown,
      html: workspaceInfo?.html || undefined,
    };

    const result = await provider.pushContent(
      workspace,
      content,
      connection.connection_id,
      true
    );

    if (!result) {
      return NextResponse.json({ error: 'Failed to push to Confluence' }, { status: 500 });
    }

    await trackPushToKb(supabase, user.id, 'confluence', null, result.resourceId);

    return NextResponse.json(
      {
        success: true,
        resource_id: result.resourceId,
        url: result.metadata?.url,
        workspace_info: result,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('Confluence diff push error:', err);
    return NextResponse.json(
      {
        error: 'Failed to push diff to Confluence',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}
