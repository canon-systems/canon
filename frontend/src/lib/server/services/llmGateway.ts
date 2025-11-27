const GATEWAY_URL = process.env.VERCEL_AI_GATEWAY_URL || '';
const GATEWAY_API_KEY = process.env.VERCEL_AI_GATEWAY_API_KEY || '';

type Message = { role: 'system' | 'user' | 'assistant'; content: string };

export class LLMGateway {
	private url: string;
	private apiKey: string;
	private defaultTemperature = 0.3;

	constructor() {
		this.url = GATEWAY_URL.replace(/\/+$/, '');
		this.apiKey = GATEWAY_API_KEY;

		if (!this.url || !this.apiKey) {
			throw new Error('LLM gateway configuration is missing');
		}
	}

	async call(messages: Message[], model: string, temperature?: number): Promise<string> {
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
		});

		const payload = await response.json().catch(() => ({}));
		if (!response.ok) {
			throw new Error(payload?.error?.message || payload?.message || `LLM HTTP ${response.status}`);
		}

		const content = payload?.choices?.[0]?.message?.content;
		return typeof content === 'string' ? content.trim() : '';
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

