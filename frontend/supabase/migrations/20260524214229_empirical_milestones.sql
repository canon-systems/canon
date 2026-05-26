ALTER TABLE ramp_milestones
  ADD COLUMN IF NOT EXISTS capability_outcome text,
  ADD COLUMN IF NOT EXISTS briefing_goal text,
  ADD COLUMN IF NOT EXISTS real_work_trigger text,
  ADD COLUMN IF NOT EXISTS success_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS retrieval_brief text,
  ADD COLUMN IF NOT EXISTS evidence_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS confidence numeric(3, 2) NOT NULL DEFAULT 0.50,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS approved_from_proposal_id uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$
BEGIN
  ALTER TABLE ramp_milestones
    ADD CONSTRAINT ramp_milestones_status_check
    CHECK (status IN ('active', 'archived'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE ramp_milestones
    ADD CONSTRAINT ramp_milestones_confidence_check
    CHECK (confidence >= 0 AND confidence <= 1);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS milestone_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('AI Solutions Architect', 'Solutions Engineer', 'Implementation Engineer')),
  suggested_day_trigger integer NOT NULL CHECK (suggested_day_trigger >= 0),
  title text NOT NULL,
  capability_outcome text NOT NULL,
  briefing_goal text NOT NULL,
  real_work_trigger text NOT NULL,
  success_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  retrieval_brief text NOT NULL,
  evidence_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  rationale text,
  confidence numeric(3, 2) NOT NULL DEFAULT 0.50 CHECK (confidence >= 0 AND confidence <= 1),
  normalized_key text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected')),
  approved_milestone_id uuid REFERENCES ramp_milestones(id) ON DELETE SET NULL,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS milestone_proposals_org_role_status_idx
  ON milestone_proposals (organization_id, role, status, suggested_day_trigger);

CREATE UNIQUE INDEX IF NOT EXISTS milestone_proposals_open_key_idx
  ON milestone_proposals (organization_id, role, normalized_key)
  WHERE status = 'draft';

CREATE TABLE IF NOT EXISTS new_hire_milestone_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  new_hire_id uuid NOT NULL REFERENCES new_hires(id) ON DELETE CASCADE,
  milestone_id uuid NOT NULL REFERENCES ramp_milestones(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'briefed', 'evidence_detected', 'verified')),
  current_confidence numeric(3, 2) NOT NULL DEFAULT 0 CHECK (current_confidence >= 0 AND current_confidence <= 1),
  first_briefed_at timestamptz,
  last_evidence_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (new_hire_id, milestone_id)
);

CREATE INDEX IF NOT EXISTS new_hire_milestone_progress_hire_idx
  ON new_hire_milestone_progress (new_hire_id, status);

CREATE TABLE IF NOT EXISTS milestone_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  progress_id uuid REFERENCES new_hire_milestone_progress(id) ON DELETE CASCADE,
  new_hire_id uuid NOT NULL REFERENCES new_hires(id) ON DELETE CASCADE,
  milestone_id uuid NOT NULL REFERENCES ramp_milestones(id) ON DELETE CASCADE,
  evidence_type text NOT NULL CHECK (evidence_type IN (
    'access_readiness',
    'tool_activity',
    'communication_activity',
    'customer_exposure',
    'manager_verification',
    'new_hire_blocker'
  )),
  trust_level text NOT NULL DEFAULT 'medium' CHECK (trust_level IN ('low', 'medium', 'high')),
  confidence numeric(3, 2) NOT NULL DEFAULT 0.50 CHECK (confidence >= 0 AND confidence <= 1),
  source text NOT NULL DEFAULT 'manual',
  source_event_id text,
  source_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS milestone_evidence_hire_milestone_idx
  ON milestone_evidence (new_hire_id, milestone_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS milestone_evidence_source_event_idx
  ON milestone_evidence (new_hire_id, milestone_id, source, source_event_id)
  WHERE source_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS milestone_response_tokens (
  token text PRIMARY KEY,
  new_hire_id uuid NOT NULL REFERENCES new_hires(id) ON DELETE CASCADE,
  milestone_id uuid NOT NULL REFERENCES ramp_milestones(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS milestone_response_tokens_lookup_idx
  ON milestone_response_tokens (new_hire_id, milestone_id, expires_at);

CREATE TABLE IF NOT EXISTS onboarding_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  new_hire_id uuid REFERENCES new_hires(id) ON DELETE CASCADE,
  milestone_id uuid REFERENCES ramp_milestones(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('milestone_auto_verified', 'milestone_needs_review', 'milestone_blocked')),
  title text NOT NULL,
  body text NOT NULL,
  delivery_channel text NOT NULL DEFAULT 'app' CHECK (delivery_channel IN ('app', 'slack')),
  slack_target text,
  slack_sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onboarding_notifications_org_idx
  ON onboarding_notifications (organization_id, read_at, created_at DESC);

ALTER TABLE milestone_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE new_hire_milestone_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestone_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestone_response_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "milestone_proposals_select" ON milestone_proposals
    FOR SELECT USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
  CREATE POLICY "milestone_proposals_insert" ON milestone_proposals
    FOR INSERT WITH CHECK (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
  CREATE POLICY "milestone_proposals_update" ON milestone_proposals
    FOR UPDATE USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
  CREATE POLICY "milestone_proposals_delete" ON milestone_proposals
    FOR DELETE USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "new_hire_milestone_progress_select" ON new_hire_milestone_progress
    FOR SELECT USING (new_hire_id IN (SELECT id FROM new_hires WHERE organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())));
  CREATE POLICY "new_hire_milestone_progress_insert" ON new_hire_milestone_progress
    FOR INSERT WITH CHECK (new_hire_id IN (SELECT id FROM new_hires WHERE organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())));
  CREATE POLICY "new_hire_milestone_progress_update" ON new_hire_milestone_progress
    FOR UPDATE USING (new_hire_id IN (SELECT id FROM new_hires WHERE organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())));
  CREATE POLICY "new_hire_milestone_progress_delete" ON new_hire_milestone_progress
    FOR DELETE USING (new_hire_id IN (SELECT id FROM new_hires WHERE organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "milestone_evidence_select" ON milestone_evidence
    FOR SELECT USING (new_hire_id IN (SELECT id FROM new_hires WHERE organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())));
  CREATE POLICY "milestone_evidence_insert" ON milestone_evidence
    FOR INSERT WITH CHECK (new_hire_id IN (SELECT id FROM new_hires WHERE organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())));
  CREATE POLICY "milestone_evidence_update" ON milestone_evidence
    FOR UPDATE USING (new_hire_id IN (SELECT id FROM new_hires WHERE organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())));
  CREATE POLICY "milestone_evidence_delete" ON milestone_evidence
    FOR DELETE USING (new_hire_id IN (SELECT id FROM new_hires WHERE organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "milestone_response_tokens_select" ON milestone_response_tokens
    FOR SELECT USING (new_hire_id IN (SELECT id FROM new_hires WHERE organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())));
  CREATE POLICY "milestone_response_tokens_insert" ON milestone_response_tokens
    FOR INSERT WITH CHECK (new_hire_id IN (SELECT id FROM new_hires WHERE organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())));
  CREATE POLICY "milestone_response_tokens_update" ON milestone_response_tokens
    FOR UPDATE USING (new_hire_id IN (SELECT id FROM new_hires WHERE organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())));
  CREATE POLICY "milestone_response_tokens_delete" ON milestone_response_tokens
    FOR DELETE USING (new_hire_id IN (SELECT id FROM new_hires WHERE organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "onboarding_notifications_select" ON onboarding_notifications
    FOR SELECT USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
  CREATE POLICY "onboarding_notifications_insert" ON onboarding_notifications
    FOR INSERT WITH CHECK (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
  CREATE POLICY "onboarding_notifications_update" ON onboarding_notifications
    FOR UPDATE USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
  CREATE POLICY "onboarding_notifications_delete" ON onboarding_notifications
    FOR DELETE USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
