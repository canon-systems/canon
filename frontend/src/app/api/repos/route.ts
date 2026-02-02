import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { ingestSource, type WorkspaceSource } from '@/lib/server/services/sourceIngest';
import { trackRepoConnected } from '@/lib/server/services/usageTracking';

type CreateSource = {
  name: string;
  provider: string;
  scope: Record<string, unknown>;
  connection_id?: string | null;
};

const providerAuthMap: Record<string, string> = {
  github: 'github',
  gitlab: 'gitlab',
  jira: 'confluence',
  confluence: 'confluence',
  slack: 'slack',
};

/**
 * GET: List all sources for the workspace
 * POST: Create a new source configuration
 */
export async function GET() {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('workspace_sources')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json(data || [], { status: 200 });
  } catch (err: unknown) {
    console.error('List repos error:', err);
    return NextResponse.json(
      {
        error: 'Failed to list repositories',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const body = (await request.json()) as { sources?: CreateSource[]; mode?: 'single' | 'multi' } & CreateSource;

    const sources: CreateSource[] = Array.isArray((body as { sources?: CreateSource[] }).sources)
      ? (body as { sources: CreateSource[] }).sources
      : [body as CreateSource];
    const mode = body.mode === 'single' || body.mode === 'multi' ? body.mode : 'multi';

    if (sources.length === 0) {
      return NextResponse.json({ error: 'No sources provided' }, { status: 400 });
    }

    // Preload user connections for providers to auto-fill connection_id when not provided
    const { data: connections } = await supabase
      .from('oauth_connections')
      .select('id, connection_id, provider')
      .eq('user_id', user.id)
      .eq('status', 'active');

    const rows = [];
    for (const src of sources) {
      if (!src.name || !src.provider || !src.scope) {
        return NextResponse.json({ error: 'name, provider, and scope are required for each source' }, { status: 400 });
      }

      const providerKey = src.provider.toLowerCase();
      const authProvider = providerAuthMap[providerKey] || providerKey;
      // Resolve connection id to the oauth_connections.id (UUID) that satisfies the FK
      let resolvedConnId: string | null = null;
      if (src.connection_id) {
        resolvedConnId =
          connections?.find(
            (c) =>
              c.id === src.connection_id ||
              c.connection_id === src.connection_id ||
              (c.connection_id || '').toString() === src.connection_id
          )?.id || null;
      } else {
        resolvedConnId =
          connections?.find((c) => (c.provider || '').toLowerCase() === authProvider)?.id || null;
      }

      if (!resolvedConnId && ['github', 'gitlab', 'jira', 'confluence', 'slack'].includes(authProvider)) {
        return NextResponse.json({ error: `Missing OAuth connection for provider ${src.provider}` }, { status: 400 });
      }

      rows.push({
        user_id: user.id,
        name: src.name,
        provider: src.provider,
        scope: src.scope,
        connection_id: resolvedConnId,
        status_payload: {
          status: 'queueing',
          progress_pct: 5,
          step_label: 'Queued for setup',
        },
        last_error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    const { data, error } = await supabase.from('workspace_sources').insert(rows).select();

    if (error) {
      console.error('Failed to create sources:', error);
      throw error;
    }

    // Log connection for each new source so logs list them properly
    for (const row of data || []) {
      const ws = row as WorkspaceSource & { id: string; name?: string; provider?: string; external_url?: string };
      trackRepoConnected(
        supabase,
        user.id,
        ws.id,
        ws.external_url ?? '',
        ws.provider ?? 'unknown'
      ).catch((err) => console.warn('Failed to track repo connected:', err));
    }

    // Kick off ingestion sequentially (could be parallelized with workers)
    const createdSourceIds = (data || []).map((r) => r.id);
    for (const row of data || []) {
      // Fire and forget; don't block the response. Pass mode and createdSourceIds so merged AKUs use only the sources just added.
      ingestSource(supabase, row as WorkspaceSource, { mode, createdSourceIds }).catch((err) => {
        console.error('[ingestSource] failed', err);
      });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err: unknown) {
    console.error('Create repo error:', err);
    return NextResponse.json(
      {
        error: 'Failed to connect to source',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
