import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  extractJiraCanonicalEvents,
  insertCanonicalEvents,
  insertRawEvent,
  filterNewCanonicalEvents,
  resolveJiraSourceId,
  upsertDailyMetrics,
} from '@/lib/server/diff/webhookIngest';
import { getJiraWebhookConnectionByTenant } from '@/lib/server/jira/webhooks';
import { withConfluenceAccessToken } from '@/lib/server/oauth/tokenStore';

const timingSafeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

const verifyHmacSignature = (rawBody: string, signature: string | null, secret: string | undefined): boolean => {
  if (!secret) return true; // allow in dev if not configured
  if (!signature) return true; // OAuth 2.0 webhooks may not include signature headers

  const [scheme, value] = signature.split('=');
  if (!scheme || !value) return false;

  const algo = scheme === 'sha1' ? 'sha1' : 'sha256';
  const digest = `${scheme}=${crypto.createHmac(algo, secret).update(rawBody).digest('hex')}`;
  return timingSafeEqual(digest, signature);
};

const shouldEnforceSignature = (): boolean => {
  const raw = process.env.JIRA_WEBHOOK_REQUIRE_SIGNATURE;
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

type JiraStatusCategoryName = 'To Do' | 'In Progress' | 'Done' | string;

async function getStatusCategoryMap(connectionId: string, cloudId: string) {
  const response = await withConfluenceAccessToken({
    connectionId,
    run: async (token) =>
      fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/status`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      }),
  });

  if (!response.ok) {
    return new Map<string, JiraStatusCategoryName>();
  }

  const data = await response.json().catch(() => []);
  const map = new Map<string, JiraStatusCategoryName>();
  if (Array.isArray(data)) {
    for (const status of data) {
      const id = status?.id ? String(status.id) : null;
      const category = status?.statusCategory?.name;
      if (id && typeof category === 'string') {
        map.set(id, category);
      }
    }
  }
  return map;
}

async function getConnectionIdForSourceId(supabase: ReturnType<typeof createServiceRoleClient>, sourceId: string) {
  const { data: sourceRow } = await supabase
    .from('workspace_sources')
    .select('connection_id')
    .eq('id', sourceId)
    .maybeSingle();

  if (!sourceRow?.connection_id) {
    return null;
  }

  const { data: connectionRow } = await supabase
    .from('oauth_connections')
    .select('connection_id')
    .eq('id', sourceRow.connection_id)
    .eq('provider', 'confluence')
    .eq('status', 'active')
    .maybeSingle();

  return connectionRow?.connection_id ?? null;
}

export async function handleJiraWebhook(request: NextRequest, tenantId?: string) {
  const rawBody = await request.text();
  console.log('[jira/webhook] received', { tenantId: tenantId ?? null, size: rawBody.length });
  const signature = request.headers.get('x-hub-signature-256') || request.headers.get('x-hub-signature');
  const signatureValid = verifyHmacSignature(rawBody, signature, process.env.JIRA_WEBHOOK_SECRET);
  if (!signatureValid) {
    if (shouldEnforceSignature()) {
      return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 401 });
    }
    console.warn('[jira/webhook] signature mismatch (non-blocking)', {
      tenantId: tenantId ?? null,
      hasSignature: Boolean(signature),
    });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  console.log('[jira/webhook] payload keys', Object.keys(payload));

  let connectionId: string | null = null;
  if (tenantId) {
    connectionId = await getJiraWebhookConnectionByTenant(tenantId);
  }

  const issue = payload.issue as { key?: string; fields?: { project?: { key?: string } } } | undefined;
  const projectKey = issue?.fields?.project?.key || null;
  if (!projectKey) {
    console.warn('[jira/webhook] missing project key');
    return NextResponse.json({ ok: true, skipped: 'missing project key' });
  }

  const supabase = createServiceRoleClient();
  const sourceId = await resolveJiraSourceId(supabase, projectKey, tenantId ?? null);
  if (!sourceId) {
    console.warn('[jira/webhook] source not found', { projectKey, tenantId: tenantId ?? null });
    return NextResponse.json({ ok: true, skipped: 'source not found' });
  }

  if (!connectionId) {
    connectionId = await getConnectionIdForSourceId(supabase, sourceId);
    if (tenantId && !connectionId) {
      console.warn('[jira/webhook] tenant resolved source but no active OAuth connection found', { tenantId, sourceId });
    }
  }

  const webhookId =
    request.headers.get('x-atlassian-webhook-identifier') ||
    request.headers.get('x-atlassian-webhook-id') ||
    null;
  const webhookEvent = typeof payload.webhookEvent === 'string' ? payload.webhookEvent : 'unknown';
  const issueKey = typeof issue?.key === 'string' ? issue.key : null;
  console.log('[jira/webhook] event', webhookEvent, 'project', projectKey, 'issue', issueKey, 'tenant', tenantId ?? 'n/a');

  try {
    await insertRawEvent({
      supabase,
      sourceId,
      provider: 'jira',
      externalEventId: webhookId,
      eventType: webhookEvent,
      eventTime: (payload as { issue?: { fields?: { updated?: string } } }).issue?.fields?.updated || null,
      payload,
    });
  } catch (err) {
    console.error('[jira/webhook] insertRawEvent threw', err);
  }

  let statusCategoryMap: Map<string, JiraStatusCategoryName> | undefined;
  const changelogItems = Array.isArray((payload.changelog as { items?: unknown[] } | undefined)?.items)
    ? (payload.changelog as { items: Array<Record<string, unknown>> }).items
    : [];
  const hasStatusChange = changelogItems.some((item) => item?.field === 'status');
  if (hasStatusChange && connectionId && tenantId) {
    statusCategoryMap = await getStatusCategoryMap(connectionId, tenantId);
  }

  const canonicalEvents = extractJiraCanonicalEvents(payload, statusCategoryMap);
  console.log('[jira/webhook] canonical events', {
    tenantId: tenantId ?? null,
    issueKey,
    eventTypes: canonicalEvents.map((event) => event.event_kind),
  });
  if (canonicalEvents.length > 0) {
    const newEvents = await filterNewCanonicalEvents({ supabase, sourceId, events: canonicalEvents });
    if (newEvents.length > 0) {
      await insertCanonicalEvents({ supabase, sourceId, provider: 'jira', events: newEvents });
      await upsertDailyMetrics({ supabase, sourceId, provider: 'jira', events: newEvents });
    } else {
      console.log('[jira/webhook] all canonical events already recorded; skipping insert/metrics', {
        issueKey,
        eventTypes: canonicalEvents.map((event) => event.event_kind),
      });
    }
  }

  return NextResponse.json({ ok: true });
}
