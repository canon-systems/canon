CREATE TABLE IF NOT EXISTS role_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (length(trim(role)) >= 2 AND length(trim(role)) <= 120),
  job_description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (organization_id, role)
);

ALTER TABLE role_profiles
  ADD COLUMN IF NOT EXISTS job_description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$
BEGIN
  ALTER TABLE role_profiles
    ADD CONSTRAINT role_profiles_role_length_check CHECK (length(trim(role)) >= 2 AND length(trim(role)) <= 120);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE role_profiles
    ADD CONSTRAINT role_profiles_status_check CHECK (status IN ('active', 'archived'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS role_profiles_org_role_idx
  ON role_profiles (organization_id, role);

ALTER TABLE role_profiles ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON role_profiles TO authenticated;

ALTER TABLE new_hires DROP CONSTRAINT IF EXISTS new_hires_role_check;
ALTER TABLE milestone_proposals DROP CONSTRAINT IF EXISTS milestone_proposals_role_check;
ALTER TABLE org_tools DROP CONSTRAINT IF EXISTS org_tools_role_check;

INSERT INTO role_profiles (organization_id, role, display_order, updated_at)
SELECT organizations.id, defaults.role, defaults.display_order, now()
FROM organizations
CROSS JOIN (
  VALUES
    ('AI Solutions Architect', 10),
    ('Solutions Engineer', 20),
    ('Implementation Engineer', 30)
) AS defaults(role, display_order)
ON CONFLICT (organization_id, role) DO NOTHING;

INSERT INTO role_profiles (organization_id, role, display_order, updated_at)
SELECT DISTINCT organization_id, role, 100, now()
FROM new_hires
WHERE role IS NOT NULL AND trim(role) <> ''
ON CONFLICT (organization_id, role) DO NOTHING;

INSERT INTO role_profiles (organization_id, role, display_order, updated_at)
SELECT DISTINCT organization_id, role, 100, now()
FROM ramp_milestones
WHERE organization_id IS NOT NULL AND role IS NOT NULL AND trim(role) <> ''
ON CONFLICT (organization_id, role) DO NOTHING;

INSERT INTO role_profiles (organization_id, role, display_order, updated_at)
SELECT DISTINCT organization_id, role, 100, now()
FROM milestone_proposals
WHERE role IS NOT NULL AND trim(role) <> ''
ON CONFLICT (organization_id, role) DO NOTHING;

INSERT INTO role_profiles (organization_id, role, display_order, updated_at)
SELECT DISTINCT organization_id, role, 100, now()
FROM org_tools
WHERE role IS NOT NULL AND trim(role) <> ''
ON CONFLICT (organization_id, role) DO NOTHING;

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
