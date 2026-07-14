ALTER TABLE knowledge_sources
  DROP CONSTRAINT IF EXISTS knowledge_sources_provider_check;

ALTER TABLE knowledge_sources
  ADD CONSTRAINT knowledge_sources_provider_check
  CHECK (provider IN ('slack', 'notion', 'google_drive', 'gong', 'granola'));
