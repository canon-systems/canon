import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getSignalInvestigation } from '@/lib/server/signals/engine';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const supabase = await createClient();
    const payload = await getSignalInvestigation({
      supabase,
      userId: user.id,
      signalId: id,
    });

    if (!payload.signal) {
      return NextResponse.json({ error: 'Signal not found' }, { status: 404 });
    }

    return NextResponse.json(payload, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/signals/:id] GET failed', error);
    return NextResponse.json({ error: 'Failed to load signal detail', detail: message }, { status: 500 });
  }
}
