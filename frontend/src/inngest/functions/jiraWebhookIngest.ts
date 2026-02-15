import { inngest } from '../client';
import {
  processJiraWebhookPayload,
  type ProcessJiraWebhookPayloadParams,
} from '@/lib/server/diff/jiraWebhookProcessor';
import { createLogger, errorMessage } from '@/lib/server/logging';

type JiraWebhookReceivedEvent = {
  requestId?: string;
  receivedAt?: string;
  rawSize?: number;
  signature?: {
    present?: boolean;
    valid?: boolean;
    reason?: string;
  };
  webhookId?: string | null;
  webhookEvent?: string;
  issueKey?: string | null;
  projectKey?: string | null;
  payload?: Record<string, unknown>;
};

const log = createLogger('inngest.jira_webhook_ingest', {
  label: 'Jira Webhook Worker',
  eventLabels: {
    worker_start: 'Worker Started',
    worker_complete: 'Worker Completed',
    worker_failed: 'Worker Failed',
    event_skipped_invalid_payload: 'Skipped Invalid Payload',
  },
});

export const ingestJiraWebhook = inngest.createFunction(
  {
    id: 'jira-webhook-ingest',
    name: 'Canon: Jira Webhook Ingest',
    retries: 2,
    concurrency: { limit: 10 },
  },
  { event: 'jira/webhook.received' },
  async ({ event, step }) => {
    const data = (event.data ?? {}) as JiraWebhookReceivedEvent;
    const requestId = typeof data.requestId === 'string' && data.requestId.length > 0 ? data.requestId : null;

    if (!data.payload || typeof data.payload !== 'object' || Array.isArray(data.payload)) {
      log.warn('event_skipped_invalid_payload', {
        requestId,
        webhookId: data.webhookId ?? null,
        webhookEvent: data.webhookEvent ?? null,
      });
      return { ok: true, skipped: 'invalid_payload', requestId };
    }

    log.info('worker_start', {
      requestId,
      webhookId: data.webhookId ?? null,
      webhookEvent: data.webhookEvent ?? null,
      issueKey: data.issueKey ?? null,
      projectKey: data.projectKey ?? null,
      receivedAt: data.receivedAt ?? null,
      rawSize: data.rawSize ?? null,
      signaturePresent: data.signature?.present ?? null,
      signatureValid: data.signature?.valid ?? null,
      signatureReason: data.signature?.reason ?? null,
    });

    const params: ProcessJiraWebhookPayloadParams = {
      payload: data.payload,
      requestId,
      webhookId: data.webhookId ?? null,
      rawSize: data.rawSize ?? null,
      signaturePresent: data.signature?.present ?? false,
      signatureValid: data.signature?.valid ?? false,
      signatureReason: data.signature?.reason ?? null,
    };

    try {
      const result = await step.run('process-jira-webhook', async () => processJiraWebhookPayload(params));
      log.info('worker_complete', {
        requestId,
        webhookId: data.webhookId ?? null,
        webhookEvent: data.webhookEvent ?? null,
        issueKey: data.issueKey ?? null,
        projectKey: data.projectKey ?? null,
        skipped: result.skipped ?? null,
        sourceId: result.sourceId ?? null,
        canonicalEventCount: result.canonicalEventCount ?? 0,
        insertedCanonicalEventCount: result.insertedCanonicalEventCount ?? 0,
      });
      return result;
    } catch (error) {
      log.error('worker_failed', {
        requestId,
        webhookId: data.webhookId ?? null,
        webhookEvent: data.webhookEvent ?? null,
        issueKey: data.issueKey ?? null,
        projectKey: data.projectKey ?? null,
        error: errorMessage(error),
      });
      throw error;
    }
  }
);
