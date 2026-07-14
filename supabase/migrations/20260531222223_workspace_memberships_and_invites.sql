CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS organization_members_user_idx
  ON organization_members (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS organization_members_org_role_idx
  ON organization_members (organization_id, role);

CREATE TABLE IF NOT EXISTS organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organization_invitations_org_email_idx
  ON organization_invitations (organization_id, lower(email), created_at DESC);

CREATE INDEX IF NOT EXISTS organization_invitations_token_idx
  ON organization_invitations (token)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

INSERT INTO organization_members (organization_id, user_id, role, updated_at)
SELECT id, owner_id, 'owner', now()
FROM organizations
WHERE owner_id IS NOT NULL
ON CONFLICT (organization_id, user_id) DO UPDATE
SET role = CASE
    WHEN organization_members.role = 'owner' THEN 'owner'
    ELSE EXCLUDED.role
  END,
  updated_at = now();

CREATE OR REPLACE FUNCTION private.is_organization_member(check_organization_id uuid, check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_members
    WHERE organization_id = check_organization_id
      AND user_id = check_user_id
  ) OR EXISTS (
    SELECT 1
    FROM organizations
    WHERE id = check_organization_id
      AND owner_id = check_user_id
  );
$$;

CREATE OR REPLACE FUNCTION private.is_organization_admin(check_organization_id uuid, check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_members
    WHERE organization_id = check_organization_id
      AND user_id = check_user_id
      AND role IN ('owner', 'admin')
  ) OR EXISTS (
    SELECT 1
    FROM organizations
    WHERE id = check_organization_id
      AND owner_id = check_user_id
  );
$$;

CREATE OR REPLACE FUNCTION private.user_can_access_hire(check_new_hire_id uuid, check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM new_hires
    WHERE id = check_new_hire_id
      AND private.is_organization_member(organization_id, check_user_id)
  );
$$;

GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_organization_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_organization_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.user_can_access_hire(uuid, uuid) TO authenticated;

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON organization_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON organization_invitations TO authenticated;

DROP POLICY IF EXISTS "organization_members_select" ON organization_members;
DROP POLICY IF EXISTS "organization_members_insert_admin" ON organization_members;
DROP POLICY IF EXISTS "organization_members_update_admin" ON organization_members;
DROP POLICY IF EXISTS "organization_members_delete_admin" ON organization_members;
CREATE POLICY "organization_members_select" ON organization_members
  FOR SELECT USING (private.is_organization_member(organization_id));
CREATE POLICY "organization_members_insert_admin" ON organization_members
  FOR INSERT WITH CHECK (private.is_organization_admin(organization_id));
CREATE POLICY "organization_members_update_admin" ON organization_members
  FOR UPDATE USING (private.is_organization_admin(organization_id))
  WITH CHECK (private.is_organization_admin(organization_id));
CREATE POLICY "organization_members_delete_admin" ON organization_members
  FOR DELETE USING (private.is_organization_admin(organization_id));

DROP POLICY IF EXISTS "organization_invitations_select" ON organization_invitations;
DROP POLICY IF EXISTS "organization_invitations_insert_admin" ON organization_invitations;
DROP POLICY IF EXISTS "organization_invitations_update_admin" ON organization_invitations;
DROP POLICY IF EXISTS "organization_invitations_delete_admin" ON organization_invitations;
CREATE POLICY "organization_invitations_select" ON organization_invitations
  FOR SELECT USING (private.is_organization_admin(organization_id));
CREATE POLICY "organization_invitations_insert_admin" ON organization_invitations
  FOR INSERT WITH CHECK (private.is_organization_admin(organization_id));
CREATE POLICY "organization_invitations_update_admin" ON organization_invitations
  FOR UPDATE USING (private.is_organization_admin(organization_id))
  WITH CHECK (private.is_organization_admin(organization_id));
CREATE POLICY "organization_invitations_delete_admin" ON organization_invitations
  FOR DELETE USING (private.is_organization_admin(organization_id));

DROP POLICY IF EXISTS "org_select" ON organizations;
DROP POLICY IF EXISTS "org_insert" ON organizations;
DROP POLICY IF EXISTS "org_update" ON organizations;
DROP POLICY IF EXISTS "org_delete" ON organizations;
CREATE POLICY "org_select" ON organizations
  FOR SELECT USING (private.is_organization_member(id));
CREATE POLICY "org_insert" ON organizations
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "org_update" ON organizations
  FOR UPDATE USING (private.is_organization_admin(id))
  WITH CHECK (private.is_organization_admin(id));
CREATE POLICY "org_delete" ON organizations
  FOR DELETE USING (private.is_organization_admin(id));

DROP POLICY IF EXISTS "new_hires_select" ON new_hires;
DROP POLICY IF EXISTS "new_hires_insert" ON new_hires;
DROP POLICY IF EXISTS "new_hires_update" ON new_hires;
DROP POLICY IF EXISTS "new_hires_delete" ON new_hires;
CREATE POLICY "new_hires_select" ON new_hires
  FOR SELECT USING (private.is_organization_member(organization_id));
CREATE POLICY "new_hires_insert" ON new_hires
  FOR INSERT WITH CHECK (private.is_organization_member(organization_id));
CREATE POLICY "new_hires_update" ON new_hires
  FOR UPDATE USING (private.is_organization_member(organization_id))
  WITH CHECK (private.is_organization_member(organization_id));
CREATE POLICY "new_hires_delete" ON new_hires
  FOR DELETE USING (private.is_organization_admin(organization_id));

DROP POLICY IF EXISTS "knowledge_sources_select" ON knowledge_sources;
DROP POLICY IF EXISTS "knowledge_sources_insert" ON knowledge_sources;
DROP POLICY IF EXISTS "knowledge_sources_update" ON knowledge_sources;
DROP POLICY IF EXISTS "knowledge_sources_delete" ON knowledge_sources;
CREATE POLICY "knowledge_sources_select" ON knowledge_sources
  FOR SELECT USING (private.is_organization_member(organization_id));
CREATE POLICY "knowledge_sources_insert" ON knowledge_sources
  FOR INSERT WITH CHECK (private.is_organization_member(organization_id));
CREATE POLICY "knowledge_sources_update" ON knowledge_sources
  FOR UPDATE USING (private.is_organization_member(organization_id))
  WITH CHECK (private.is_organization_member(organization_id));
CREATE POLICY "knowledge_sources_delete" ON knowledge_sources
  FOR DELETE USING (private.is_organization_admin(organization_id));

DROP POLICY IF EXISTS "knowledge_chunks_select" ON knowledge_chunks;
DROP POLICY IF EXISTS "knowledge_chunks_insert" ON knowledge_chunks;
DROP POLICY IF EXISTS "knowledge_chunks_update" ON knowledge_chunks;
DROP POLICY IF EXISTS "knowledge_chunks_delete" ON knowledge_chunks;
CREATE POLICY "knowledge_chunks_select" ON knowledge_chunks
  FOR SELECT USING (private.is_organization_member(organization_id));
CREATE POLICY "knowledge_chunks_insert" ON knowledge_chunks
  FOR INSERT WITH CHECK (private.is_organization_member(organization_id));
CREATE POLICY "knowledge_chunks_update" ON knowledge_chunks
  FOR UPDATE USING (private.is_organization_member(organization_id))
  WITH CHECK (private.is_organization_member(organization_id));
CREATE POLICY "knowledge_chunks_delete" ON knowledge_chunks
  FOR DELETE USING (private.is_organization_admin(organization_id));

DROP POLICY IF EXISTS "ramp_milestones_select" ON ramp_milestones;
DROP POLICY IF EXISTS "ramp_milestones_insert" ON ramp_milestones;
DROP POLICY IF EXISTS "ramp_milestones_update" ON ramp_milestones;
DROP POLICY IF EXISTS "ramp_milestones_delete" ON ramp_milestones;
CREATE POLICY "ramp_milestones_select" ON ramp_milestones
  FOR SELECT USING (organization_id IS NULL OR private.is_organization_member(organization_id));
CREATE POLICY "ramp_milestones_insert" ON ramp_milestones
  FOR INSERT WITH CHECK (private.is_organization_member(organization_id));
CREATE POLICY "ramp_milestones_update" ON ramp_milestones
  FOR UPDATE USING (private.is_organization_member(organization_id))
  WITH CHECK (private.is_organization_member(organization_id));
CREATE POLICY "ramp_milestones_delete" ON ramp_milestones
  FOR DELETE USING (private.is_organization_admin(organization_id));

DROP POLICY IF EXISTS "ramp_deliveries_select" ON ramp_deliveries;
DROP POLICY IF EXISTS "ramp_deliveries_insert" ON ramp_deliveries;
DROP POLICY IF EXISTS "ramp_deliveries_update" ON ramp_deliveries;
DROP POLICY IF EXISTS "ramp_deliveries_delete" ON ramp_deliveries;
CREATE POLICY "ramp_deliveries_select" ON ramp_deliveries
  FOR SELECT USING (private.user_can_access_hire(new_hire_id));
CREATE POLICY "ramp_deliveries_insert" ON ramp_deliveries
  FOR INSERT WITH CHECK (private.user_can_access_hire(new_hire_id));
CREATE POLICY "ramp_deliveries_update" ON ramp_deliveries
  FOR UPDATE USING (private.user_can_access_hire(new_hire_id))
  WITH CHECK (private.user_can_access_hire(new_hire_id));
CREATE POLICY "ramp_deliveries_delete" ON ramp_deliveries
  FOR DELETE USING (private.user_can_access_hire(new_hire_id));

DROP POLICY IF EXISTS "access_requests_select" ON access_requests;
DROP POLICY IF EXISTS "access_requests_insert" ON access_requests;
DROP POLICY IF EXISTS "access_requests_update" ON access_requests;
DROP POLICY IF EXISTS "access_requests_delete" ON access_requests;
CREATE POLICY "access_requests_select" ON access_requests
  FOR SELECT USING (private.user_can_access_hire(new_hire_id));
CREATE POLICY "access_requests_insert" ON access_requests
  FOR INSERT WITH CHECK (private.user_can_access_hire(new_hire_id));
CREATE POLICY "access_requests_update" ON access_requests
  FOR UPDATE USING (private.user_can_access_hire(new_hire_id))
  WITH CHECK (private.user_can_access_hire(new_hire_id));
CREATE POLICY "access_requests_delete" ON access_requests
  FOR DELETE USING (private.user_can_access_hire(new_hire_id));

DROP POLICY IF EXISTS "readiness_items_select" ON readiness_items;
DROP POLICY IF EXISTS "readiness_items_insert" ON readiness_items;
DROP POLICY IF EXISTS "readiness_items_update" ON readiness_items;
DROP POLICY IF EXISTS "readiness_items_delete" ON readiness_items;
CREATE POLICY "readiness_items_select" ON readiness_items
  FOR SELECT USING (private.is_organization_member(organization_id));
CREATE POLICY "readiness_items_insert" ON readiness_items
  FOR INSERT WITH CHECK (private.is_organization_member(organization_id));
CREATE POLICY "readiness_items_update" ON readiness_items
  FOR UPDATE USING (private.is_organization_member(organization_id))
  WITH CHECK (private.is_organization_member(organization_id));
CREATE POLICY "readiness_items_delete" ON readiness_items
  FOR DELETE USING (private.is_organization_admin(organization_id));

DROP POLICY IF EXISTS "readiness_delivery_settings_select" ON readiness_delivery_settings;
DROP POLICY IF EXISTS "readiness_delivery_settings_insert" ON readiness_delivery_settings;
DROP POLICY IF EXISTS "readiness_delivery_settings_update" ON readiness_delivery_settings;
DROP POLICY IF EXISTS "readiness_delivery_settings_delete" ON readiness_delivery_settings;
CREATE POLICY "readiness_delivery_settings_select" ON readiness_delivery_settings
  FOR SELECT USING (private.is_organization_member(organization_id));
CREATE POLICY "readiness_delivery_settings_insert" ON readiness_delivery_settings
  FOR INSERT WITH CHECK (private.is_organization_admin(organization_id));
CREATE POLICY "readiness_delivery_settings_update" ON readiness_delivery_settings
  FOR UPDATE USING (private.is_organization_admin(organization_id))
  WITH CHECK (private.is_organization_admin(organization_id));
CREATE POLICY "readiness_delivery_settings_delete" ON readiness_delivery_settings
  FOR DELETE USING (private.is_organization_admin(organization_id));

DROP POLICY IF EXISTS "org_tools: org members can manage their own" ON org_tools;
DROP POLICY IF EXISTS "org_tools_select" ON org_tools;
DROP POLICY IF EXISTS "org_tools_insert" ON org_tools;
DROP POLICY IF EXISTS "org_tools_update" ON org_tools;
DROP POLICY IF EXISTS "org_tools_delete" ON org_tools;
CREATE POLICY "org_tools_select" ON org_tools
  FOR SELECT USING (private.is_organization_member(organization_id));
CREATE POLICY "org_tools_insert" ON org_tools
  FOR INSERT WITH CHECK (private.is_organization_admin(organization_id));
CREATE POLICY "org_tools_update" ON org_tools
  FOR UPDATE USING (private.is_organization_admin(organization_id))
  WITH CHECK (private.is_organization_admin(organization_id));
CREATE POLICY "org_tools_delete" ON org_tools
  FOR DELETE USING (private.is_organization_admin(organization_id));

DROP POLICY IF EXISTS "role_profiles_select" ON role_profiles;
DROP POLICY IF EXISTS "role_profiles_insert" ON role_profiles;
DROP POLICY IF EXISTS "role_profiles_update" ON role_profiles;
DROP POLICY IF EXISTS "role_profiles_delete" ON role_profiles;
CREATE POLICY "role_profiles_select" ON role_profiles
  FOR SELECT USING (private.is_organization_member(organization_id));
CREATE POLICY "role_profiles_insert" ON role_profiles
  FOR INSERT WITH CHECK (private.is_organization_admin(organization_id));
CREATE POLICY "role_profiles_update" ON role_profiles
  FOR UPDATE USING (private.is_organization_admin(organization_id))
  WITH CHECK (private.is_organization_admin(organization_id));
CREATE POLICY "role_profiles_delete" ON role_profiles
  FOR DELETE USING (private.is_organization_admin(organization_id));

DROP POLICY IF EXISTS "milestone_generation_runs_select" ON milestone_generation_runs;
DROP POLICY IF EXISTS "milestone_generation_runs_insert" ON milestone_generation_runs;
DROP POLICY IF EXISTS "milestone_generation_runs_update" ON milestone_generation_runs;
DROP POLICY IF EXISTS "milestone_generation_runs_delete" ON milestone_generation_runs;
CREATE POLICY "milestone_generation_runs_select" ON milestone_generation_runs
  FOR SELECT USING (private.is_organization_member(organization_id));
CREATE POLICY "milestone_generation_runs_insert" ON milestone_generation_runs
  FOR INSERT WITH CHECK (private.is_organization_member(organization_id));
CREATE POLICY "milestone_generation_runs_update" ON milestone_generation_runs
  FOR UPDATE USING (private.is_organization_member(organization_id))
  WITH CHECK (private.is_organization_member(organization_id));
CREATE POLICY "milestone_generation_runs_delete" ON milestone_generation_runs
  FOR DELETE USING (private.is_organization_admin(organization_id));

DROP POLICY IF EXISTS "milestone_proposals_select" ON milestone_proposals;
DROP POLICY IF EXISTS "milestone_proposals_insert" ON milestone_proposals;
DROP POLICY IF EXISTS "milestone_proposals_update" ON milestone_proposals;
DROP POLICY IF EXISTS "milestone_proposals_delete" ON milestone_proposals;
CREATE POLICY "milestone_proposals_select" ON milestone_proposals
  FOR SELECT USING (private.is_organization_member(organization_id));
CREATE POLICY "milestone_proposals_insert" ON milestone_proposals
  FOR INSERT WITH CHECK (private.is_organization_member(organization_id));
CREATE POLICY "milestone_proposals_update" ON milestone_proposals
  FOR UPDATE USING (private.is_organization_member(organization_id))
  WITH CHECK (private.is_organization_member(organization_id));
CREATE POLICY "milestone_proposals_delete" ON milestone_proposals
  FOR DELETE USING (private.is_organization_admin(organization_id));

DROP POLICY IF EXISTS "onboarding_notifications_select" ON onboarding_notifications;
DROP POLICY IF EXISTS "onboarding_notifications_insert" ON onboarding_notifications;
DROP POLICY IF EXISTS "onboarding_notifications_update" ON onboarding_notifications;
DROP POLICY IF EXISTS "onboarding_notifications_delete" ON onboarding_notifications;
CREATE POLICY "onboarding_notifications_select" ON onboarding_notifications
  FOR SELECT USING (private.is_organization_member(organization_id));
CREATE POLICY "onboarding_notifications_insert" ON onboarding_notifications
  FOR INSERT WITH CHECK (private.is_organization_member(organization_id));
CREATE POLICY "onboarding_notifications_update" ON onboarding_notifications
  FOR UPDATE USING (private.is_organization_member(organization_id))
  WITH CHECK (private.is_organization_member(organization_id));
CREATE POLICY "onboarding_notifications_delete" ON onboarding_notifications
  FOR DELETE USING (private.is_organization_admin(organization_id));

DROP POLICY IF EXISTS "new_hire_milestone_progress_select" ON new_hire_milestone_progress;
DROP POLICY IF EXISTS "new_hire_milestone_progress_insert" ON new_hire_milestone_progress;
DROP POLICY IF EXISTS "new_hire_milestone_progress_update" ON new_hire_milestone_progress;
DROP POLICY IF EXISTS "new_hire_milestone_progress_delete" ON new_hire_milestone_progress;
CREATE POLICY "new_hire_milestone_progress_select" ON new_hire_milestone_progress
  FOR SELECT USING (private.user_can_access_hire(new_hire_id));
CREATE POLICY "new_hire_milestone_progress_insert" ON new_hire_milestone_progress
  FOR INSERT WITH CHECK (private.user_can_access_hire(new_hire_id));
CREATE POLICY "new_hire_milestone_progress_update" ON new_hire_milestone_progress
  FOR UPDATE USING (private.user_can_access_hire(new_hire_id))
  WITH CHECK (private.user_can_access_hire(new_hire_id));
CREATE POLICY "new_hire_milestone_progress_delete" ON new_hire_milestone_progress
  FOR DELETE USING (private.user_can_access_hire(new_hire_id));

DROP POLICY IF EXISTS "milestone_evidence_select" ON milestone_evidence;
DROP POLICY IF EXISTS "milestone_evidence_insert" ON milestone_evidence;
DROP POLICY IF EXISTS "milestone_evidence_update" ON milestone_evidence;
DROP POLICY IF EXISTS "milestone_evidence_delete" ON milestone_evidence;
CREATE POLICY "milestone_evidence_select" ON milestone_evidence
  FOR SELECT USING (private.user_can_access_hire(new_hire_id));
CREATE POLICY "milestone_evidence_insert" ON milestone_evidence
  FOR INSERT WITH CHECK (private.user_can_access_hire(new_hire_id));
CREATE POLICY "milestone_evidence_update" ON milestone_evidence
  FOR UPDATE USING (private.user_can_access_hire(new_hire_id))
  WITH CHECK (private.user_can_access_hire(new_hire_id));
CREATE POLICY "milestone_evidence_delete" ON milestone_evidence
  FOR DELETE USING (private.user_can_access_hire(new_hire_id));

NOTIFY pgrst, 'reload schema';
