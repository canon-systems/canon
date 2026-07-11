ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS resent_at timestamptz;
