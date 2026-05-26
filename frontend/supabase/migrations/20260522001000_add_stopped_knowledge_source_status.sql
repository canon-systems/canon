ALTER TABLE knowledge_sources
  DROP CONSTRAINT IF EXISTS knowledge_sources_status_check;

ALTER TABLE knowledge_sources
  ADD CONSTRAINT knowledge_sources_status_check
  CHECK (status IN ('pending', 'syncing', 'active', 'error', 'stopped'));
