CREATE TABLE readiness_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  category text NOT NULL CHECK (
    category IN (
      'product_change',
      'customer_objection',
      'demo_guidance',
      'implementation_pattern'
    )
  ),

  title text NOT NULL,
  summary text NOT NULL,
  recommended_action text,
  impact_level text DEFAULT 'medium' CHECK (impact_level IN ('low', 'medium', 'high')),
  affected_roles text[] DEFAULT '{}',

  source text DEFAULT 'slack',
  source_url text,
  source_metadata jsonb DEFAULT '{}',

  status text DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'sent', 'archived')),

  detected_at timestamptz DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE readiness_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "readiness_items_select" ON readiness_items
  FOR SELECT USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
CREATE POLICY "readiness_items_insert" ON readiness_items
  FOR INSERT WITH CHECK (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
CREATE POLICY "readiness_items_update" ON readiness_items
  FOR UPDATE USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
CREATE POLICY "readiness_items_delete" ON readiness_items
  FOR DELETE USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
