DELETE FROM knowledge_sources
WHERE provider = 'gong';

DELETE FROM oauth_provider_tokens
WHERE provider = 'gong';

DELETE FROM oauth_connections
WHERE provider = 'gong';
