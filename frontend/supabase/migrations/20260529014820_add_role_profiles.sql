CREATE TABLE IF NOT EXISTS role_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('AI Solutions Architect', 'Solutions Engineer', 'Implementation Engineer')),
  job_description text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (organization_id, role)
);

CREATE INDEX IF NOT EXISTS role_profiles_org_role_idx
  ON role_profiles (organization_id, role);

ALTER TABLE role_profiles ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON role_profiles TO authenticated;

DO $$
BEGIN
  CREATE POLICY "role_profiles_select" ON role_profiles
    FOR SELECT USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
  CREATE POLICY "role_profiles_insert" ON role_profiles
    FOR INSERT WITH CHECK (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
  CREATE POLICY "role_profiles_update" ON role_profiles
    FOR UPDATE USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
  CREATE POLICY "role_profiles_delete" ON role_profiles
    FOR DELETE USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
