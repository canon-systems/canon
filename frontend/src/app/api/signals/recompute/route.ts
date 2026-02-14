import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Manual recompute is disabled. Signals are recomputed automatically.' },
      { status: 410 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/signals/recompute] POST failed', error);
    return NextResponse.json({ error: 'Failed to recompute signals', detail: message }, { status: 500 });
  }
}
