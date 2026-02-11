import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  extractGithubCanonicalEvents,
  insertCanonicalEvents,
  insertRawEvent,
  filterNewCanonicalEvents,
  resolveGithubSourceId,
  upsertDailyMetrics,
} from '@/lib/server/diff/webhookIngest';

export const dynamic = 'force-dynamic';

const timingSafeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

const verifyGithubSignature = (rawBody: string, signature: string | null, secret: string | undefined): boolean => {
  if (!secret) return true; // allow in dev if not configured
  if (!signature) return false;
  const digest = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  return timingSafeEqual(digest, signature);
};

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');
  const eventType = request.headers.get('x-github-event') || 'unknown';
  const deliveryId = request.headers.get('x-github-delivery');

  if (!verifyGithubSignature(rawBody, signature, process.env.GITHUB_WEBHOOK_SECRET)) {
    return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 401 });
  }

  if (eventType === 'ping') {
    return NextResponse.json({ ok: true });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const repository = payload.repository as { full_name?: string } | undefined;
  const repoFullName = repository?.full_name;
  if (!repoFullName) {
    return NextResponse.json({ ok: true, skipped: 'missing repo' });
  }

  const supabase = createServiceRoleClient();
  const sourceId = await resolveGithubSourceId(supabase, repoFullName);
  if (!sourceId) {
    return NextResponse.json({ ok: true, skipped: 'source not found' });
  }

  await insertRawEvent({
    supabase,
    sourceId,
    provider: 'github',
    externalEventId: deliveryId,
    eventType,
    eventTime: (payload as { repository?: { updated_at?: string } }).repository?.updated_at || null,
    payload,
  });

  const canonicalEvents = extractGithubCanonicalEvents(payload);
  if (canonicalEvents.length > 0) {
    const newEvents = await filterNewCanonicalEvents({ supabase, sourceId, events: canonicalEvents });
    if (newEvents.length > 0) {
      await insertCanonicalEvents({ supabase, sourceId, provider: 'github', events: newEvents });
      await upsertDailyMetrics({ supabase, sourceId, provider: 'github', events: newEvents });
    }
  }

  return NextResponse.json({ ok: true });
}
