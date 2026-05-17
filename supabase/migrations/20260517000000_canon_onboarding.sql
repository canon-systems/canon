-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- organizations
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  slack_team_id text,
  slack_bot_token text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_select" ON organizations
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "org_insert" ON organizations
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "org_update" ON organizations
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "org_delete" ON organizations
  FOR DELETE USING (auth.uid() = owner_id);

-- new_hires
CREATE TABLE new_hires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id),
  name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('AI Solutions Architect', 'Solutions Engineer', 'Implementation Engineer')),
  slack_user_id text,
  start_date date NOT NULL,
  ramp_day integer DEFAULT 0,
  status text DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE new_hires ENABLE ROW LEVEL SECURITY;

CREATE POLICY "new_hires_select" ON new_hires
  FOR SELECT USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
CREATE POLICY "new_hires_insert" ON new_hires
  FOR INSERT WITH CHECK (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
CREATE POLICY "new_hires_update" ON new_hires
  FOR UPDATE USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
CREATE POLICY "new_hires_delete" ON new_hires
  FOR DELETE USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));

-- knowledge_sources
CREATE TABLE knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'slack' CHECK (provider IN ('slack', 'notion', 'google_drive', 'confluence')),
  name text NOT NULL,
  slack_channel_id text,
  slack_channel_name text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'syncing', 'active', 'error')),
  last_synced_at timestamptz,
  chunk_count integer DEFAULT 0,
  error_message text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "knowledge_sources_select" ON knowledge_sources
  FOR SELECT USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
CREATE POLICY "knowledge_sources_insert" ON knowledge_sources
  FOR INSERT WITH CHECK (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
CREATE POLICY "knowledge_sources_update" ON knowledge_sources
  FOR UPDATE USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
CREATE POLICY "knowledge_sources_delete" ON knowledge_sources
  FOR DELETE USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));

-- knowledge_chunks
CREATE TABLE knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  source_id uuid REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  content text NOT NULL,
  metadata jsonb DEFAULT '{}',
  embedding vector(1536),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX ON knowledge_chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "knowledge_chunks_select" ON knowledge_chunks
  FOR SELECT USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
CREATE POLICY "knowledge_chunks_insert" ON knowledge_chunks
  FOR INSERT WITH CHECK (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
CREATE POLICY "knowledge_chunks_update" ON knowledge_chunks
  FOR UPDATE USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
CREATE POLICY "knowledge_chunks_delete" ON knowledge_chunks
  FOR DELETE USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));

-- ramp_milestones
CREATE TABLE ramp_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  role text NOT NULL,
  day_trigger integer NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  knowledge_query text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ramp_milestones ENABLE ROW LEVEL SECURITY;

-- Global defaults (organization_id IS NULL) are readable by all authenticated users
CREATE POLICY "ramp_milestones_select" ON ramp_milestones
  FOR SELECT USING (
    organization_id IS NULL
    OR organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())
  );
CREATE POLICY "ramp_milestones_insert" ON ramp_milestones
  FOR INSERT WITH CHECK (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
CREATE POLICY "ramp_milestones_update" ON ramp_milestones
  FOR UPDATE USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
CREATE POLICY "ramp_milestones_delete" ON ramp_milestones
  FOR DELETE USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));

-- ramp_deliveries
CREATE TABLE ramp_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  new_hire_id uuid REFERENCES new_hires(id) ON DELETE CASCADE,
  milestone_id uuid REFERENCES ramp_milestones(id),
  delivery_status text DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'delivered', 'failed')),
  delivery_channel text DEFAULT 'slack',
  content_delivered text,
  slack_ts text,
  delivered_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ramp_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ramp_deliveries_select" ON ramp_deliveries
  FOR SELECT USING (
    new_hire_id IN (
      SELECT id FROM new_hires
      WHERE organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())
    )
  );
CREATE POLICY "ramp_deliveries_insert" ON ramp_deliveries
  FOR INSERT WITH CHECK (
    new_hire_id IN (
      SELECT id FROM new_hires
      WHERE organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())
    )
  );
CREATE POLICY "ramp_deliveries_update" ON ramp_deliveries
  FOR UPDATE USING (
    new_hire_id IN (
      SELECT id FROM new_hires
      WHERE organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())
    )
  );
CREATE POLICY "ramp_deliveries_delete" ON ramp_deliveries
  FOR DELETE USING (
    new_hire_id IN (
      SELECT id FROM new_hires
      WHERE organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())
    )
  );

-- access_requests
CREATE TABLE access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  new_hire_id uuid REFERENCES new_hires(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  requested_from_name text NOT NULL,
  requested_from_email text NOT NULL,
  requested_from_slack_id text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'acknowledged', 'granted')),
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "access_requests_select" ON access_requests
  FOR SELECT USING (
    new_hire_id IN (
      SELECT id FROM new_hires
      WHERE organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())
    )
  );
CREATE POLICY "access_requests_insert" ON access_requests
  FOR INSERT WITH CHECK (
    new_hire_id IN (
      SELECT id FROM new_hires
      WHERE organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())
    )
  );
CREATE POLICY "access_requests_update" ON access_requests
  FOR UPDATE USING (
    new_hire_id IN (
      SELECT id FROM new_hires
      WHERE organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())
    )
  );
CREATE POLICY "access_requests_delete" ON access_requests
  FOR DELETE USING (
    new_hire_id IN (
      SELECT id FROM new_hires
      WHERE organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())
    )
  );

-- pgvector similarity search RPC
CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  query_embedding vector(1536),
  organization_id uuid,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE sql STABLE AS $$
  SELECT
    id,
    content,
    metadata,
    1 - (embedding <=> query_embedding) AS similarity
  FROM knowledge_chunks
  WHERE knowledge_chunks.organization_id = match_knowledge_chunks.organization_id
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
