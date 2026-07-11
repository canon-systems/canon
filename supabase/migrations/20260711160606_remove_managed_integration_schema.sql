DROP INDEX IF EXISTS knowledge_sources_integration_connection_idx;
DROP INDEX IF EXISTS knowledge_sources_org_provider_source_type_idx;

ALTER TABLE knowledge_sources
  DROP COLUMN IF EXISTS integration_connection_id,
  DROP COLUMN IF EXISTS source_config,
  DROP COLUMN IF EXISTS sync_mode,
  DROP COLUMN IF EXISTS external_url,
  DROP COLUMN IF EXISTS external_source_id,
  DROP COLUMN IF EXISTS source_type;

DROP TABLE IF EXISTS integration_connections;

ALTER TABLE knowledge_sources
  DROP CONSTRAINT IF EXISTS knowledge_sources_provider_check;

ALTER TABLE knowledge_sources
  ADD CONSTRAINT knowledge_sources_provider_check
  CHECK (provider IN ('slack', 'notion', 'google_drive', 'gong'));

DELETE FROM knowledge_sources
WHERE provider = 'gong';

DELETE FROM oauth_provider_tokens
WHERE provider = 'gong';

DELETE FROM oauth_connections
WHERE provider = 'gong';
