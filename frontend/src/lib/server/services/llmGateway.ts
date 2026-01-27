const GATEWAY_URL = process.env.VERCEL_AI_GATEWAY_URL || '';
const GATEWAY_API_KEY = process.env.VERCEL_AI_GATEWAY_API_KEY || '';

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

	async call(messages: Message[], model: string, temperature?: number, context?: string, abortSignal?: AbortSignal): Promise<string> {

		try {
			// Use provided AbortSignal or create one for timeout
			let controller: AbortController;
			let timeoutId: NodeJS.Timeout | undefined;

			if (abortSignal) {
				// Use the provided signal
				controller = { signal: abortSignal } as AbortController;
			} else {
				// Create our own for timeout (3 minutes for LLM calls)
				controller = new AbortController();
				timeoutId = setTimeout(() => controller.abort(), 180000);
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
				console.error(`[LLMGateway] ❌ API call failed: ${payload?.error?.message || payload?.message || `HTTP ${response.status}`}`);
				throw new Error(payload?.error?.message || payload?.message || `LLM HTTP ${response.status}`);
			}

			const content = payload?.choices?.[0]?.message?.content;
			return typeof content === 'string' ? content.trim() : '';
		} catch (error: unknown) {
			// Handle specific error types
			if (error instanceof Error && error.name === 'AbortError') {
				console.error(`[LLMGateway] ⏰ Request timed out after 180 seconds`);
				throw new Error('LLM API call timed out after 180 seconds');
			}

			console.error(`[LLMGateway] 💥 Network or parsing error:`, error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown network error';
			throw new Error(`LLM API call failed: ${errorMessage}`);
		}
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

