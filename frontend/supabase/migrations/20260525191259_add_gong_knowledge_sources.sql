ALTER TABLE knowledge_sources
  DROP CONSTRAINT IF EXISTS knowledge_sources_provider_check;

ALTER TABLE knowledge_sources
  ADD CONSTRAINT knowledge_sources_provider_check
  CHECK (provider IN ('slack', 'notion', 'google_drive', 'confluence', 'gong'));

CREATE INDEX IF NOT EXISTS knowledge_sources_org_provider_idx
  ON knowledge_sources(organization_id, provider);
