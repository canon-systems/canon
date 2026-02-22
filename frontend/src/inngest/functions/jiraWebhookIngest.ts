import { inngest } from '../client';
import {
  processJiraWebhookPayload,
  type JiraApiRequest,
  type ProcessJiraWebhookPayloadParams,
} from '@/lib/server/diff/jiraWebhookProcessor';
import { createLogger, errorMessage } from '@/lib/server/logging';
import { withConfluenceAccessToken } from '@/lib/server/oauth/tokenStore';

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
    concurrency: { limit: 5 },
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
      let jiraApiStepIndex = 0;
      const jiraApiRequest: JiraApiRequest = async ({ connectionId, cloudId, path }) =>
        withConfluenceAccessToken({
          connectionId,
          run: async (token) => {
            jiraApiStepIndex += 1;
            const safePath = path
              .replace(/[^a-zA-Z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '')
              .slice(0, 60);
            const stepId = `jira-api-${jiraApiStepIndex}-${cloudId}-${safePath || 'request'}`;

            const result = await step.run(stepId, async () => {
              const response = await fetch(`https://api.atlassian.com/ex/jira/${cloudId}${path}`, {
                headers: {
                  Authorization: `Bearer ${token}`,
                  Accept: 'application/json',
                },
              });
              return {
                status: response.status,
                headers: Object.fromEntries(response.headers.entries()),
                body: await response.text(),
              };
            });

            if (result.status === 401) {
              const error = new Error(`Jira API request failed: ${path} (status=401)`) as Error & { status?: number };
              error.status = 401;
              throw error;
            }
            return new Response(result.body, {
              status: result.status,
              headers: result.headers,
            });
          },
        });

      const result = await processJiraWebhookPayload(params, { jiraApiRequest });
      log.info('worker_complete', {
        requestId,
        webhookId: data.webhookId ?? null,
        webhookEvent: data.webhookEvent ?? null,
        issueKey: data.issueKey ?? null,
        projectKey: data.projectKey ?? null,
        skipped: result.skipped ?? null,
        sourceId: result.sourceId ?? null,
        sourceName: result.sourceName ?? null,
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
