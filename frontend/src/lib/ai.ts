import { createGateway } from '@ai-sdk/gateway';

export const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY,
});

export const llm = gateway('anthropic/claude-haiku-4-5');
export const embeddingModel = gateway.textEmbeddingModel('openai/text-embedding-3-small');
