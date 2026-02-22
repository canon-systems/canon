import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { inngest } from '@/inngest/client';
import { createLogger, errorMessage } from '@/lib/server/logging';
import { getJiraWebhookSecretByToken } from '@/lib/server/jira/webhookSecret';

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

export async function handleJiraWebhook(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const receivedAt = new Date().toISOString();
  const rawBody = await request.text();
  const signature = readSignature(request);

  const urlToken = request.nextUrl.searchParams.get('t');
  const secretFromToken = urlToken ? await getJiraWebhookSecretByToken(urlToken) : null;
  const webhookSecret = secretFromToken ?? process.env.JIRA_WEBHOOK_SECRET;
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';

  if (isProduction && !webhookSecret) {
    log.error('signature_rejected', {
      requestId,
      signaturePresent: Boolean(signature),
      signatureReason: 'missing_secret',
      hasSecret: false,
      hasToken: Boolean(urlToken),
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    });
    return NextResponse.json({ ok: false, error: 'Webhook secret is not configured' }, { status: 500 });
  }

  const signatureResult = verifyHmacSignature(rawBody, signature, webhookSecret);

  log.info('webhook_received', {
    requestId,
    rawSize: rawBody.length,
    signaturePresent: signatureResult.signaturePresent,
    signatureValid: signatureResult.valid,
    signatureReason: signatureResult.reason,
    hasSecret: Boolean(webhookSecret),
  });

  if (!signatureResult.valid) {
    log.warn('signature_rejected', {
      requestId,
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

    log.info('webhook_queued', {
      requestId,
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
      webhookId,
      webhookEvent,
      issueKey,
      projectKey,
      error: errorMessage(error),
    });
    return NextResponse.json({ ok: false, error: 'Failed to queue webhook' }, { status: 500 });
  }
}
