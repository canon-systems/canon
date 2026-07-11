CREATE TABLE IF NOT EXISTS milestone_generation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  proposals_created integer NOT NULL DEFAULT 0 CHECK (proposals_created >= 0),
  roles_processed integer NOT NULL DEFAULT 0 CHECK (roles_processed >= 0),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS milestone_generation_runs_org_status_idx
  ON milestone_generation_runs (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS milestone_generation_runs_org_created_idx
  ON milestone_generation_runs (organization_id, created_at DESC);

ALTER TABLE milestone_generation_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "milestone_generation_runs_select" ON milestone_generation_runs
    FOR SELECT USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
  CREATE POLICY "milestone_generation_runs_insert" ON milestone_generation_runs
    FOR INSERT WITH CHECK (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
  CREATE POLICY "milestone_generation_runs_update" ON milestone_generation_runs
    FOR UPDATE USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
  CREATE POLICY "milestone_generation_runs_delete" ON milestone_generation_runs
    FOR DELETE USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
