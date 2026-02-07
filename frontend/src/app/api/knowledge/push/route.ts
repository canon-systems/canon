import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { planKnowledgePush } from '@/lib/server/services/knowledgePushPlanner';
import { runKnowledgePush } from '@/lib/server/services/knowledgePushRunner';

export const dynamic = 'force-dynamic';

type PushBody = {
  provider: 'notion' | 'confluence';
  rootResourceId: string;
  rootMetadata?: Record<string, unknown>;
  audiences?: string[];
  connectionId?: string | null;
  existingRootResourceId?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as PushBody;
    const { provider, rootResourceId, rootMetadata, audiences, connectionId, existingRootResourceId } = body;

    if (!provider || (provider !== 'notion' && provider !== 'confluence')) {
      return NextResponse.json({ error: 'provider must be notion or confluence' }, { status: 400 });
    }
    if (!rootResourceId || typeof rootResourceId !== 'string') {
      return NextResponse.json({ error: 'rootResourceId is required' }, { status: 400 });
    }

    const supabase = await createClient();
    // Load AKUs + audience views for user
    const { data: akus, error: akuErr } = await supabase
      .from('akus')
      .select('id, title, body, audience_views:audience_views(audience, projection, status)')
      .eq('user_id', user.id);
    if (akuErr) {
      console.error('[knowledge/push] failed to load akus', akuErr);
      return NextResponse.json({ error: 'Failed to load AKUs' }, { status: 500 });
    }

    const filteredAkus = Array.isArray(akus)
      ? akus.map((a) => ({
          ...a,
          audience_views: Array.isArray(a.audience_views)
            ? a.audience_views.filter((v) => !audiences || audiences.includes(v.audience))
            : [],
        }))
      : [];

    const plan = planKnowledgePush({ akus: filteredAkus });

    console.log('[knowledge/push] planning', { akus: filteredAkus.length, provider, rootResourceId });

    const { results, rootPageId } = await runKnowledgePush({
      supabase,
      userId: user.id,
      provider,
      plan,
      rootResourceId,
      rootMetadata,
      connectionId,
      existingRootResourceId,
    });

    console.log('[knowledge/push] completed', {
      created: results.filter((r) => r.status === 'created').length,
      updated: results.filter((r) => r.status === 'updated').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      failed: results.filter((r) => r.status === 'failed').length,
    });

    return NextResponse.json({ success: true, results, rootPageId });
  } catch (err: unknown) {
    console.error('knowledge/push error', err);
    return NextResponse.json(
      { error: 'Failed to push knowledge', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
