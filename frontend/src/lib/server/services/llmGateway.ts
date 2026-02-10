const GATEWAY_URL = process.env.VERCEL_AI_GATEWAY_URL || '';
const GATEWAY_API_KEY = process.env.VERCEL_AI_GATEWAY_API_KEY || '';

// Single, fixed values for all environments to keep behavior predictable
const DEFAULT_TIMEOUT_MS = 60000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1000;

export type Message = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * Model context window limits (in tokens)
 * Note: These are conservative limits leaving room for output tokens
 */
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
	// OpenAI GPT-5 models
	'openai/gpt-5.2': 400000,
	'openai/gpt-5': 400000,
	'openai/gpt-5-nano': 400000,
	// OpenAI GPT-4 models
	'openai/gpt-4o': 128000,
	'openai/gpt-4.1-nano': 128000,
	'gpt-4o': 128000, // Backward compatibility
	// Anthropic Claude 4.x models
	'anthropic/claude-sonnet-4': 200000,
	'anthropic/claude-sonnet-4.5': 200000,
	'anthropic/claude-opus-4': 200000,
	'anthropic/claude-opus-4.5': 200000,
	// Google Gemini models
	'google/gemini-2.5-pro': 1000000,
	'google/gemini-2.5-flash': 1000000,
	'google/gemini-3-pro-preview': 1000000,
	'google/gemini-3-flash': 1000000,
};

/**
 * Fallback model for when token limits are exceeded
 * Uses Gemini 3 Flash with 1M token context window
 */
export const LARGE_CONTEXT_FALLBACK_MODEL = 'google/gemini-3-flash';

/**
 * Estimate token count from text
 * Uses conservative estimate of ~3.5 chars per token for code
 */
export function estimateTokenCount(text: string): number {
	return Math.ceil(text.length / 3.5);
}

/**
 * Estimate total tokens for a set of messages
 */
export function estimateMessagesTokenCount(messages: Message[]): number {
	return messages.reduce((total, msg) => total + estimateTokenCount(msg.content), 0);
}

/**
 * Get context limit for a model
 */
export function getContextLimit(model: string): number {
	return MODEL_CONTEXT_LIMITS[model] || 128000;
}

/**
 * Select the appropriate model based on token count
 * Falls back to Gemini 1.5 Pro for large contexts
 */
export function selectModelForTokenCount(estimatedTokens: number, preferredModel: string): string {
	const preferredLimit = getContextLimit(preferredModel);
	const safetyMargin = 10000; // Reserve for output and overhead

	if (estimatedTokens < preferredLimit - safetyMargin) {
		return preferredModel;
	}

	// Check if Gemini can handle it
	const geminiLimit = getContextLimit(LARGE_CONTEXT_FALLBACK_MODEL);
	if (estimatedTokens < geminiLimit - safetyMargin) {
		console.log(
			`[LLMGateway] Token count (${estimatedTokens}) exceeds ${preferredModel} limit (${preferredLimit}). ` +
			`Switching to ${LARGE_CONTEXT_FALLBACK_MODEL}.`
		);
		return LARGE_CONTEXT_FALLBACK_MODEL;
	}

	// Even Gemini can't handle it - return preferred and let it fail with a clear error
	console.warn(
		`[LLMGateway] Token count (${estimatedTokens}) exceeds even ${LARGE_CONTEXT_FALLBACK_MODEL} limit (${geminiLimit}). ` +
		`Proceeding with ${preferredModel} - expect failure.`
	);
	return preferredModel;
}

export class LLMGateway {
	private url: string;
	private apiKey: string;
	private defaultTemperature = 0.3;

	constructor() {
		this.url = GATEWAY_URL.replace(/\/+$/, '');
		this.apiKey = GATEWAY_API_KEY;

		console.log(`🤖 [LLM] Gateway initialized`);

		if (!this.url || !this.apiKey) {
			throw new Error('LLM gateway configuration is missing. Please check VERCEL_AI_GATEWAY_URL and VERCEL_AI_GATEWAY_API_KEY environment variables.');
		}
	}

  async call(
    messages: Message[],
    model: string,
    temperature?: number,
    context?: string,
    abortSignal?: AbortSignal,
    options: { timeoutMs?: number; maxRetries?: number; retryDelayMs?: number } = {}
  ): Promise<string> {

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxRetries = Math.max(0, options.maxRetries ?? MAX_RETRIES);
    const retryDelayMs = options.retryDelayMs ?? RETRY_BASE_DELAY_MS;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const isLast = attempt === maxRetries;
      try {
        console.log(
          `[LLMGateway] ▶️ call start: model=${model} attempt=${attempt + 1}/${maxRetries + 1} timeout=${timeoutMs}ms`
        );
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
          console.error(`[LLMGateway] ❌ API call failed (attempt ${attempt + 1}/${maxRetries + 1}): ${message}`);
          if (!isLast && retryable) {
            const delay = retryDelayMs * Math.pow(2, attempt);
            console.log(`[LLMGateway] 🔁 retrying in ${delay}ms after ${message}`);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          throw new Error(message);
        }

        const usage = payload?.usage || {};
        console.log(
          `🤖 [LLM] model=${model} prompt_tokens=${usage.prompt_tokens ?? '?'} completion_tokens=${usage.completion_tokens ?? '?'} total=${usage.total_tokens ?? '?'} (attempt ${attempt + 1})`
        );

        const content = payload?.choices?.[0]?.message?.content;
        return typeof content === 'string' ? content.trim() : '';
      } catch (error: unknown) {
        const isAbort = error instanceof Error && error.name === 'AbortError';
        const message = isAbort ? `timeout after ${timeoutMs}ms` : (error instanceof Error ? error.message : 'Unknown network error');
        const retryable = isAbort || (error instanceof Error && /ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed/i.test(error.message));

        console.error(`[LLMGateway] ${isAbort ? '⏰' : '💥'} Attempt ${attempt + 1}/${maxRetries + 1} failed: ${message}`);

        if (!isLast && retryable) {
          const delay = retryDelayMs * Math.pow(2, attempt);
          console.log(`[LLMGateway] 🔁 retrying in ${delay}ms after ${message}`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

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
