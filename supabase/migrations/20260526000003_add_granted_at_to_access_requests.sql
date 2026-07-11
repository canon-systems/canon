ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS granted_at timestamptz;
