import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { DiffCompareInputError, computeDiffComparison } from '@/lib/server/diff/compare';

export const dynamic = 'force-dynamic';

type RequestBody = {
  start_timestamp: string;
  end_timestamp: string;
  compare_start_timestamp?: string;
  compare_end_timestamp?: string;
  source_ids: string[];
};

function validateInput(body: Record<string, unknown> | null): { ok: boolean; value?: RequestBody; error?: string } {
  const { start_timestamp, end_timestamp, compare_start_timestamp, compare_end_timestamp, source_ids } = body || {};
  if (typeof start_timestamp !== 'string' || typeof end_timestamp !== 'string' || !start_timestamp || !end_timestamp) {
    return { ok: false, error: 'start_timestamp and end_timestamp are required' };
  }

  const normalizedSourceIds = Array.isArray(source_ids)
    ? source_ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : [];

  if (normalizedSourceIds.length === 0) {
    return { ok: false, error: 'source_ids is required and must include at least one source id' };
  }

  return {
    ok: true,
    value: {
      start_timestamp,
      end_timestamp,
      compare_start_timestamp: typeof compare_start_timestamp === 'string' ? compare_start_timestamp : undefined,
      compare_end_timestamp: typeof compare_end_timestamp === 'string' ? compare_end_timestamp : undefined,
      source_ids: normalizedSourceIds,
    },
  };
}

export async function POST(req: NextRequest) {
  const { user } = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const validation = validateInput(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const input = validation.value!;

  try {
    const comparison = await computeDiffComparison({
      userId: user.id,
      sourceIds: input.source_ids,
      startTimestamp: input.start_timestamp,
      endTimestamp: input.end_timestamp,
      compareStartTimestamp: input.compare_start_timestamp,
      compareEndTimestamp: input.compare_end_timestamp,
    });

    return NextResponse.json(comparison);
  } catch (error) {
    if (error instanceof DiffCompareInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error('[diffs/compare] compute by-source error', error);
    return NextResponse.json(
      { error: 'Failed to compute diff', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
