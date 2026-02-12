import { createLogger, errorMessage } from '@/lib/server/logging';

const GATEWAY_URL = process.env.VERCEL_AI_GATEWAY_URL || '';
const GATEWAY_API_KEY = process.env.VERCEL_AI_GATEWAY_API_KEY || '';

// Single, fixed values for all environments to keep behavior predictable
const DEFAULT_TIMEOUT_MS = 60000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1000;
const log = createLogger('llm.gateway', {
  label: 'LLM Gateway',
  eventLabels: {
    initialized: 'Gateway Initialized',
    call_start: 'Call Started',
    api_retry: 'API Retry Scheduled',
    usage: 'Token Usage',
    network_retry: 'Network Retry Scheduled',
    call_failed: 'Call Failed',
  },
});

export type Message = { role: 'system' | 'user' | 'assistant'; content: string };

export class LLMGateway {
	private url: string;
	private apiKey: string;
	private defaultTemperature = 0.3;

	constructor() {
		this.url = GATEWAY_URL.replace(/\/+$/, '');
		this.apiKey = GATEWAY_API_KEY;

		if (!this.url || !this.apiKey) {
			throw new Error('LLM gateway configuration is missing. Please check VERCEL_AI_GATEWAY_URL and VERCEL_AI_GATEWAY_API_KEY environment variables.');
		}
    log.debug('initialized', { gatewayConfigured: true });
	}

  async call(
    messages: Message[],
    model: string,
    temperature?: number,
    abortSignal?: AbortSignal,
    options: { timeoutMs?: number; maxRetries?: number; retryDelayMs?: number } = {}
  ): Promise<string> {

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxRetries = Math.max(0, options.maxRetries ?? MAX_RETRIES);
    const retryDelayMs = options.retryDelayMs ?? RETRY_BASE_DELAY_MS;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const isLast = attempt === maxRetries;
      try {
        log.debug('call_start', {
          model,
          attempt: attempt + 1,
          maxAttempts: maxRetries + 1,
          timeoutMs,
        });
        // Use provided AbortSignal or create one for timeout
        let controller: AbortController;
        let timeoutId: NodeJS.Timeout | undefined;

        if (abortSignal) {
          controller = { signal: abortSignal } as AbortController;
        } else {
          controller = new AbortController();
          timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        }

        const response = await fetch(`${this.url}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${this.apiKey}`,
            'x-vercel-ai-key': this.apiKey,
          },
          body: JSON.stringify({
            model,
            temperature: temperature ?? this.defaultTemperature,
            messages,
          }),
          signal: controller.signal,
        });

        if (timeoutId) clearTimeout(timeoutId);

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
          const retryable = response.status === 429 || response.status >= 500;
          if (!isLast && retryable) {
            const delay = retryDelayMs * Math.pow(2, attempt);
            log.warn('api_retry', {
              model,
              attempt: attempt + 1,
              maxAttempts: maxRetries + 1,
              status: response.status,
              retryInMs: delay,
              reason: message,
            });
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          throw new Error(message);
        }

        const usage = payload?.usage || {};
        log.debug('usage', {
          model,
          attempt: attempt + 1,
          promptTokens: usage.prompt_tokens ?? null,
          completionTokens: usage.completion_tokens ?? null,
          totalTokens: usage.total_tokens ?? null,
        });

        const content = payload?.choices?.[0]?.message?.content;
        return typeof content === 'string' ? content.trim() : '';
      } catch (error: unknown) {
        const isAbort = error instanceof Error && error.name === 'AbortError';
        const message = isAbort ? `timeout after ${timeoutMs}ms` : (error instanceof Error ? error.message : 'Unknown network error');
        const retryable = isAbort || (error instanceof Error && /ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed/i.test(error.message));

        if (!isLast && retryable) {
          const delay = retryDelayMs * Math.pow(2, attempt);
          log.warn('network_retry', {
            model,
            attempt: attempt + 1,
            maxAttempts: maxRetries + 1,
            retryInMs: delay,
            reason: message,
          });
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        log.error('call_failed', {
          model,
          attempt: attempt + 1,
          maxAttempts: maxRetries + 1,
          reason: errorMessage(error),
          timeoutMs,
        });

        throw new Error(isAbort ? `LLM API call timed out after ${timeoutMs}ms` : `LLM API call failed: ${message}`);
      }
    }

    throw new Error('LLM call failed after retries');
  }

	async *stream(messages: Message[], model: string, temperature?: number) {
		const response = await fetch(`${this.url}/chat/completions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				authorization: `Bearer ${this.apiKey}`,
				'x-vercel-ai-key': this.apiKey,
			},
			body: JSON.stringify({
				model,
				temperature: temperature ?? this.defaultTemperature,
				messages,
				stream: true,
			}),
		});

		if (!response.ok || !response.body) {
			const payload = await response.json().catch(() => ({}));
			throw new Error(payload?.error?.message || payload?.message || `LLM HTTP ${response.status}`);
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value, { stream: true });

				for (const line of chunk.split('\n')) {
					const trimmed = line.trim();
					if (!trimmed || trimmed === 'data: [DONE]') continue;

					const dataLine = trimmed.startsWith('data: ')
						? trimmed.slice(6)
						: trimmed;

					try {
						const parsed = JSON.parse(dataLine);
						const delta = parsed?.choices?.[0]?.delta?.content;
						if (delta) {
							yield delta;
						}
					} catch {
						continue;
					}
				}
			}
		} finally {
			reader.releaseLock();
		}
	}
}
