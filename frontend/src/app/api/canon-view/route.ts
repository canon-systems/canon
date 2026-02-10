import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sourceIdsParam = searchParams.get('sourceIds');
  const audienceFilter = searchParams.get('audience');

  type AudienceView = {
    audience: string;
    projection: string;
    summary: string;
    status: string;
  };

  type AkuRow = {
    id: string;
    title: string;
    body: string;
    type: string;
    source_ids: string[];
    scope_refs: string[];
    status: string;
    updated_at: string;
    scores?: { total?: number; [key: string]: unknown };
    audience_views?: AudienceView[];
  };

  let query = supabase
    .from('akus')
    .select(
      `
        id,
        title,
        body,
        type,
        source_ids,
        scope_refs,
        status,
        updated_at,
        audience_views (
          audience,
          projection,
          summary,
          status
        )
      `
    )
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (sourceIdsParam) {
    const ids = sourceIdsParam.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length > 0) {
      // Show AKUs that include ANY of the selected sources (overlap), not only those fully contained.
      query = query.overlaps('source_ids', ids);
    }
  }

  const { data, error } = (await query) as { data: AkuRow[] | null; error: unknown };
  if (error) {
    console.error('canon view list error', error);
    return NextResponse.json({ error: 'Failed to fetch Canon View entries' }, { status: 500 });
  }

  const filtered = (data || []).map((row) => {
    const projections = Array.isArray(row.audience_views)
      ? row.audience_views.filter((v) => !audienceFilter || v.audience === audienceFilter)
      : [];
    const scoreTotal = typeof row.scores?.total === 'number' ? row.scores.total : 0;
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      type: row.type,
      source_ids: row.source_ids,
      scope_refs: row.scope_refs,
      status: row.status,
      updated_at: row.updated_at,
      score_total: scoreTotal,
      scores: row.scores ?? {},
      projections,
    };
  });

  // Sort by score_total descending (fallback to updated_at)
  filtered.sort((a, b) => (b.score_total ?? 0) - (a.score_total ?? 0));

  return NextResponse.json(filtered);
}
