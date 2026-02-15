import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { inngest } from '@/inngest/client';
import { createLogger, errorMessage } from '@/lib/server/logging';

type SignatureReason =
  | 'missing_secret'
  | 'missing_header'
  | 'invalid_format'
  | 'unsupported_scheme'
  | 'digest_mismatch'
  | 'valid';

type SignatureCheckResult = {
  valid: boolean;
  signaturePresent: boolean;
  reason: SignatureReason;
};

type QueuedJiraWebhookEvent = {
  requestId: string;
  tenantId: string | null;
  receivedAt: string;
  rawSize: number;
  signature: {
    present: boolean;
    valid: boolean;
    reason: SignatureReason;
  };
  webhookId: string | null;
  webhookEvent: string;
  issueKey: string | null;
  projectKey: string | null;
  payload: Record<string, unknown>;
};

const log = createLogger('diff.jira_webhook_ingress', {
  label: 'Jira Webhook Ingress',
  eventLabels: {
    webhook_received: 'Webhook Received',
    signature_rejected: 'Signature Rejected',
    signature_non_blocking: 'Signature Non Blocking',
    invalid_json: 'Invalid JSON',
    webhook_queued: 'Webhook Queued',
    queue_failed: 'Queue Failed',
  },
});

const timingSafeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

const shouldEnforceSignature = (): boolean => {
  const raw = process.env.JIRA_WEBHOOK_REQUIRE_SIGNATURE;
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

function verifyHmacSignature(rawBody: string, signature: string | null, secret: string | undefined): SignatureCheckResult {
  if (!secret) {
    return { valid: true, signaturePresent: Boolean(signature), reason: 'missing_secret' };
  }

  if (!signature) {
    return { valid: false, signaturePresent: false, reason: 'missing_header' };
  }

  const [scheme, value] = signature.split('=');
  if (!scheme || !value) {
    return { valid: false, signaturePresent: true, reason: 'invalid_format' };
  }

  if (scheme !== 'sha1' && scheme !== 'sha256') {
    return { valid: false, signaturePresent: true, reason: 'unsupported_scheme' };
  }

  const digest = `${scheme}=${crypto.createHmac(scheme, secret).update(rawBody).digest('hex')}`;
  const valid = timingSafeEqual(digest, signature);
  if (!valid) {
    return { valid: false, signaturePresent: true, reason: 'digest_mismatch' };
  }

  return { valid: true, signaturePresent: true, reason: 'valid' };
}

function readSignature(request: NextRequest): string | null {
  return request.headers.get('x-hub-signature-256') || request.headers.get('x-hub-signature');
}

function readWebhookId(request: NextRequest): string | null {
  return request.headers.get('x-atlassian-webhook-identifier') || request.headers.get('x-atlassian-webhook-id');
}

export async function handleJiraWebhook(request: NextRequest, tenantId?: string) {
  const requestId = crypto.randomUUID();
  const receivedAt = new Date().toISOString();
  const rawBody = await request.text();
  const signature = readSignature(request);
  const signatureResult = verifyHmacSignature(rawBody, signature, process.env.JIRA_WEBHOOK_SECRET);
  const enforceSignature = shouldEnforceSignature();

  log.info('webhook_received', {
    requestId,
    tenantId: tenantId ?? null,
    rawSize: rawBody.length,
    signaturePresent: signatureResult.signaturePresent,
    signatureValid: signatureResult.valid,
    signatureReason: signatureResult.reason,
    enforceSignature,
    hasSecret: Boolean(process.env.JIRA_WEBHOOK_SECRET),
  });

  if (!signatureResult.valid && enforceSignature) {
    log.warn('signature_rejected', {
      requestId,
      tenantId: tenantId ?? null,
      signaturePresent: signatureResult.signaturePresent,
      signatureReason: signatureResult.reason,
    });
    return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Payload must be a JSON object');
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    log.warn('invalid_json', {
      requestId,
      tenantId: tenantId ?? null,
      rawSize: rawBody.length,
    });
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const issue = payload.issue as { key?: string; fields?: { project?: { key?: string } } } | undefined;
  const issueKey = typeof issue?.key === 'string' ? issue.key : null;
  const projectKey = issue?.fields?.project?.key || null;
  const webhookEvent = typeof payload.webhookEvent === 'string' ? payload.webhookEvent : 'unknown';
  const webhookId = readWebhookId(request);

  const eventData: QueuedJiraWebhookEvent = {
    requestId,
    tenantId: tenantId ?? null,
    receivedAt,
    rawSize: rawBody.length,
    signature: {
      present: signatureResult.signaturePresent,
      valid: signatureResult.valid,
      reason: signatureResult.reason,
    },
    webhookId,
    webhookEvent,
    issueKey,
    projectKey,
    payload,
  };

  try {
    const queueResult = await inngest.send({
      name: 'jira/webhook.received',
      data: eventData,
    });

    if (!signatureResult.valid) {
      log.warn('signature_non_blocking', {
        requestId,
        tenantId: tenantId ?? null,
        signatureReason: signatureResult.reason,
      });
    }

    log.info('webhook_queued', {
      requestId,
      tenantId: tenantId ?? null,
      webhookId,
      webhookEvent,
      issueKey,
      projectKey,
      queueResult,
    });

    return NextResponse.json({ ok: true, queued: true, requestId }, { status: 202 });
  } catch (error) {
    log.error('queue_failed', {
      requestId,
      tenantId: tenantId ?? null,
      webhookId,
      webhookEvent,
      issueKey,
      projectKey,
      error: errorMessage(error),
    });
    return NextResponse.json({ ok: false, error: 'Failed to queue webhook' }, { status: 500 });
  }
}
