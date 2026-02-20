import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import type { WorkspaceSource } from '@/lib/server/services/sourceIngest';
import { sourceUrlFromSourceScope, trackSourceConnected } from '@/lib/server/services/usageTracking';
import { patchSourceBackfillStatus } from '@/lib/server/diff/backfillStatus';
import { inngest } from '@/inngest';
import { buildSourceIdentifier, resolveSourceDomainValue } from '@/lib/sources/domainMapping';

type CreateSource = {
  name: string;
  provider: string;
  scope: Record<string, unknown>;
  connection_id?: string | null;
  domain?: string | null;
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
    console.error('List sources error:', err);
    return NextResponse.json(
      {
        error: 'Failed to list sources',
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

      let resolvedDomain: string | null = null;
      if (src.domain !== undefined && src.domain !== null && typeof src.domain !== 'string') {
        return NextResponse.json({ error: `Invalid domain value for source ${src.name}` }, { status: 400 });
      }
      if (typeof src.domain === 'string') {
        resolvedDomain = resolveSourceDomainValue(src.domain);
      }

      rows.push({
        user_id: user.id,
        name: src.name,
        provider: src.provider,
        scope: src.scope,
        source_identifier: buildSourceIdentifier({
          provider: src.provider,
          scope: src.scope,
          fallbackName: src.name,
        }),
        domain: resolvedDomain,
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

    // Log connection for each new source using a single source lifecycle event.
    for (const row of data || []) {
      const ws = row as WorkspaceSource & {
        id: string;
        name?: string;
        provider?: string;
        scope?: Record<string, unknown> | null;
      };
      const provider = (ws.provider ?? '').toLowerCase();
      const sourceUrl = sourceUrlFromSourceScope(provider, ws.scope || null);
      trackSourceConnected(supabase, user.id, ws.id, provider, sourceUrl).catch((err) =>
        console.warn('Failed to track source connected:', err)
      );
    }

    // Kick off ingestion via Inngest workers (durable in serverless; not tied to request lifetime)
    const createdSourceIds = (data || []).map((r) => r.id);
    for (const row of data || []) {
      const provider = typeof row.provider === 'string' ? row.provider.toLowerCase() : '';
      const sourceName =
        typeof row.name === 'string' && row.name.trim().length > 0
          ? row.name.trim()
          : row.id;
      const installedAt =
        typeof row.created_at === 'string' && row.created_at.trim().length > 0
          ? row.created_at
          : new Date().toISOString();

      await inngest.send({
        name: 'source/ingest.requested',
        data: {
          sourceId: row.id,
          sourceName,
          userId: user.id,
          mode,
          createdSourceIds,
        },
      });

      if (provider === 'github' || provider === 'jira') {
        await patchSourceBackfillStatus({
          supabase,
          sourceId: row.id,
          patch: {
            status: 'queued',
            progress_pct: 0,
            step_label: 'Queued for history sync',
            error: null,
          },
        });
        try {
          await inngest.send({
            name: 'diff/source.backfill.requested',
            data: {
              sourceId: row.id,
              sourceName,
              userId: user.id,
              installedAt,
            },
          });
        } catch (err) {
          await patchSourceBackfillStatus({
            supabase,
            sourceId: row.id,
            patch: {
              status: 'failed',
              step_label: 'History sync could not be queued',
              error: err instanceof Error ? err.message : String(err),
            },
          });
          console.warn('[diff/backfill] failed to enqueue source backfill', {
            sourceId: row.id,
            sourceName,
            provider,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err: unknown) {
    console.error('Create source error:', err);
    return NextResponse.json(
      {
        error: 'Failed to connect to source',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
