-- org_tools: per-org tool registry with owner info per role
CREATE TABLE org_tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  role text CHECK (role IN ('AI Solutions Architect', 'Solutions Engineer', 'Implementation Engineer')),
  owner_name text,
  owner_email text,
  owner_slack_id text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE org_tools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_tools: org members can manage their own"
  ON org_tools FOR ALL
  USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- Add confirmed status to access_requests (new hire confirms they've logged in)
ALTER TABLE access_requests
  DROP CONSTRAINT IF EXISTS access_requests_status_check;

ALTER TABLE access_requests
  ADD CONSTRAINT access_requests_status_check
  CHECK (status IN ('pending', 'sent', 'acknowledged', 'granted', 'confirmed'));

-- Add new hire confirmation tracking
ALTER TABLE access_requests
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
