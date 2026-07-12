import { createGateway } from '@ai-sdk/gateway';

const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY,
});

export const llm = gateway('anthropic/claude-sonnet-4-6');
export const embeddingModel = gateway.textEmbeddingModel('openai/text-embedding-3-small');
