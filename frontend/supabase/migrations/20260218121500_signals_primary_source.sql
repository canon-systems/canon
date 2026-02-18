-- Add a deterministic pointer from signals to the primary source used
ALTER TABLE signals
ADD COLUMN IF NOT EXISTS primary_source_id uuid REFERENCES workspace_sources (id);

-- Backfill existing signals from their run's first source id (if any)
UPDATE signals AS s
SET primary_source_id = sr.source_ids[1]
FROM signal_runs sr
WHERE s.signal_run_id = sr.id
  AND s.primary_source_id IS NULL
  AND array_length(sr.source_ids, 1) >= 1;

-- Index for lookup/filtering
CREATE INDEX IF NOT EXISTS signals_primary_source_id_idx
ON signals (primary_source_id);
