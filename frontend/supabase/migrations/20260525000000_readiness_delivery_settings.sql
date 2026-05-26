CREATE TABLE IF NOT EXISTS readiness_delivery_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  channel_id text,
  channel_name text,
  slack_user_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE readiness_delivery_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "readiness_delivery_settings_select" ON readiness_delivery_settings
    FOR SELECT USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "readiness_delivery_settings_insert" ON readiness_delivery_settings
    FOR INSERT WITH CHECK (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "readiness_delivery_settings_update" ON readiness_delivery_settings
    FOR UPDATE USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "readiness_delivery_settings_delete" ON readiness_delivery_settings
    FOR DELETE USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
