import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/inngest';
import { resolveDiffBackfillDays } from '@/lib/server/diff/backfill';
import { patchSourceBackfillStatus } from '@/lib/server/diff/backfillStatus';

export const dynamic = 'force-dynamic';

type RequestBody = {
  source_ids?: unknown;
  requested_days?: unknown;
};

function normalizeSourceIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
}

function normalizeRequestedDays(input: unknown): number | undefined {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input === 'string' && input.trim().length > 0) {
    const parsed = Number(input);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export async function POST(request: NextRequest) {
  const { user } = await getSession();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const sourceIds = normalizeSourceIds(body.source_ids);
  if (sourceIds.length === 0) {
    return NextResponse.json({ error: 'source_ids must include at least one source id' }, { status: 400 });
  }

  const requestedDays = normalizeRequestedDays(body.requested_days);
  const effectiveDays = resolveDiffBackfillDays(requestedDays);

  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from('workspace_sources')
    .select('id, provider')
    .eq('user_id', user.id)
    .in('id', sourceIds);

  if (error) {
    return NextResponse.json({ error: 'Failed to load sources', detail: error.message }, { status: 500 });
  }

  const eligibleSourceIds = (rows || [])
    .filter((row) => {
      const provider = typeof row.provider === 'string' ? row.provider.toLowerCase() : '';
      return provider === 'github' || provider === 'jira';
    })
    .map((row) => row.id as string);

  if (eligibleSourceIds.length === 0) {
    return NextResponse.json(
      { error: 'No eligible github/jira sources found in source_ids' },
      { status: 400 }
    );
  }

  const enqueueResults = await Promise.all(
    eligibleSourceIds.map(async (sourceId) => {
      await patchSourceBackfillStatus({
        supabase,
        sourceId,
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
            sourceId,
            userId: user.id,
            requestedDays: effectiveDays,
          },
        });
        return { sourceId, queued: true };
      } catch (err) {
        await patchSourceBackfillStatus({
          supabase,
          sourceId,
          patch: {
            status: 'failed',
            step_label: 'History sync could not be queued',
            error: err instanceof Error ? err.message : String(err),
          },
        });
        return {
          sourceId,
          queued: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    })
  );

  const queued = enqueueResults.filter((row) => row.queued).length;
  const failed = enqueueResults.filter((row) => !row.queued);

  return NextResponse.json(
    {
      queued,
      requested: eligibleSourceIds.length,
      requested_days: effectiveDays,
      failed,
    },
    { status: failed.length > 0 ? 207 : 200 }
  );
}
