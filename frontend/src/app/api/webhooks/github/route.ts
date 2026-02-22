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

const KNOWN_GITHUB_EVENTS = new Set([
  'ping',
  'push',
  'pull_request',
  'pull_request_review',
  'pull_request_review_comment',
  'issues',
  'issue_comment',
  'create',
  'delete',
  'release',
  'check_run',
  'check_suite',
  'workflow_run',
  'workflow_job',
  'repository',
  'installation',
  'installation_repositories',
]);

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');
  const eventType = request.headers.get('x-github-event');
  const deliveryId = request.headers.get('x-github-delivery');

  if (!eventType) {
    return NextResponse.json({ ok: false, error: 'Missing x-github-event header' }, { status: 400 });
  }
  if (!KNOWN_GITHUB_EVENTS.has(eventType)) {
    return NextResponse.json({ ok: false, error: 'Unknown GitHub event type' }, { status: 400 });
  }
  if (!deliveryId) {
    return NextResponse.json({ ok: false, error: 'Missing x-github-delivery header' }, { status: 400 });
  }

  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  if (isProduction && !webhookSecret) {
    return NextResponse.json({ ok: false, error: 'GitHub webhook secret is not configured' }, { status: 500 });
  }

  if (!verifyGithubSignature(rawBody, signature, webhookSecret)) {
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

  const installation = payload.installation as { id?: number | string } | undefined;
  const installationId = installation?.id != null ? String(installation.id) : null;
  if (!installationId) {
    return NextResponse.json({ ok: false, error: 'Missing installation.id' }, { status: 400 });
  }

  const repository = payload.repository as { id?: number | string; full_name?: string } | undefined;
  const repoFullName = repository?.full_name;
  const repositoryId = repository?.id != null ? String(repository.id) : null;

  // Repo-scoped events must include repository.id.
  if (repository && !repositoryId) {
    return NextResponse.json({ ok: false, error: 'Missing repository.id' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const { data: activeConnections } = await supabase
    .from('oauth_connections')
    .select('id, connection_id, metadata')
    .eq('provider', 'github')
    .eq('status', 'active');

  const installationIsKnown = (activeConnections || []).some((row) => {
    const connectionInstallationId = row.connection_id != null ? String(row.connection_id) : '';
    const metadata = row.metadata && typeof row.metadata === 'object'
      ? (row.metadata as Record<string, unknown>)
      : {};
    const metadataInstallationId =
      metadata.installation_id !== undefined && metadata.installation_id !== null
        ? String(metadata.installation_id)
        : '';
    return connectionInstallationId === installationId || metadataInstallationId === installationId;
  });

  if (!installationIsKnown) {
    return NextResponse.json({ ok: false, error: 'Unknown or inactive installation' }, { status: 403 });
  }

  const resolution = await resolveGithubSourceId(supabase, {
    installationId,
    repositoryId,
  });
  const sourceId = resolution.sourceId;
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
