CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  slack_team_id text,
  slack_bot_token text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS new_hires (
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

CREATE TABLE IF NOT EXISTS knowledge_sources (
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

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  source_id uuid REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  content text NOT NULL,
  metadata jsonb DEFAULT '{}',
  embedding vector(1536),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_hnsw_idx
  ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE TABLE IF NOT EXISTS ramp_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  role text NOT NULL,
  day_trigger integer NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  knowledge_query text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ramp_deliveries (
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

CREATE TABLE IF NOT EXISTS access_requests (
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

CREATE TABLE IF NOT EXISTS readiness_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('product_change', 'customer_objection', 'demo_guidance', 'implementation_pattern')),
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

CREATE TABLE IF NOT EXISTS oauth_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  connection_id text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error', 'disconnected')),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, provider),
  UNIQUE (connection_id)
);

CREATE TABLE IF NOT EXISTS oauth_provider_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id text NOT NULL REFERENCES oauth_connections(connection_id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_account_id text,
  access_token jsonb NOT NULL,
  refresh_token jsonb,
  token_type text,
  scope text,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (connection_id)
);

CREATE TABLE IF NOT EXISTS workspace_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  provider text NOT NULL,
  scope jsonb NOT NULL DEFAULT '{}',
  source_identifier text,
  domain text,
  connection_id uuid REFERENCES oauth_connections(id) ON DELETE SET NULL,
  status_payload jsonb DEFAULT '{}',
  last_error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id uuid,
  event_type text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS signal_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_ids uuid[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_run_id uuid REFERENCES signal_runs(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS signal_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_id uuid REFERENCES signals(id) ON DELETE CASCADE,
  source_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS diff_event_raw (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS diff_event_canonical (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS diff_daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oauth_connections_user_provider_idx ON oauth_connections(user_id, provider);
CREATE INDEX IF NOT EXISTS oauth_provider_tokens_user_provider_idx ON oauth_provider_tokens(user_id, provider);
CREATE INDEX IF NOT EXISTS workspace_sources_user_provider_idx ON workspace_sources(user_id, provider);
CREATE INDEX IF NOT EXISTS usage_events_user_created_idx ON usage_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS signal_runs_user_source_ids_idx ON signal_runs USING gin(source_ids);
CREATE INDEX IF NOT EXISTS signals_user_run_idx ON signals(user_id, signal_run_id);
CREATE INDEX IF NOT EXISTS signal_evidence_user_signal_idx ON signal_evidence(user_id, signal_id);
CREATE INDEX IF NOT EXISTS diff_event_raw_source_id_idx ON diff_event_raw(source_id);
CREATE INDEX IF NOT EXISTS diff_event_canonical_source_id_idx ON diff_event_canonical(source_id);
CREATE INDEX IF NOT EXISTS diff_daily_metrics_source_id_idx ON diff_daily_metrics(source_id);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE new_hires ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ramp_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE ramp_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE readiness_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_provider_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE diff_event_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE diff_event_canonical ENABLE ROW LEVEL SECURITY;
ALTER TABLE diff_daily_metrics ENABLE ROW LEVEL SECURITY;

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

DO $$
BEGIN
  CREATE POLICY "org_select" ON organizations FOR SELECT USING (auth.uid() = owner_id);
  CREATE POLICY "org_insert" ON organizations FOR INSERT WITH CHECK (auth.uid() = owner_id);
  CREATE POLICY "org_update" ON organizations FOR UPDATE USING (auth.uid() = owner_id);
  CREATE POLICY "org_delete" ON organizations FOR DELETE USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "new_hires_select" ON new_hires FOR SELECT USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
  CREATE POLICY "new_hires_insert" ON new_hires FOR INSERT WITH CHECK (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
  CREATE POLICY "new_hires_update" ON new_hires FOR UPDATE USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
  CREATE POLICY "new_hires_delete" ON new_hires FOR DELETE USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "knowledge_sources_select" ON knowledge_sources FOR SELECT USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
  CREATE POLICY "knowledge_sources_insert" ON knowledge_sources FOR INSERT WITH CHECK (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
  CREATE POLICY "knowledge_sources_update" ON knowledge_sources FOR UPDATE USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
  CREATE POLICY "knowledge_sources_delete" ON knowledge_sources FOR DELETE USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "knowledge_chunks_select" ON knowledge_chunks FOR SELECT USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
  CREATE POLICY "knowledge_chunks_insert" ON knowledge_chunks FOR INSERT WITH CHECK (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
  CREATE POLICY "knowledge_chunks_update" ON knowledge_chunks FOR UPDATE USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
  CREATE POLICY "knowledge_chunks_delete" ON knowledge_chunks FOR DELETE USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "ramp_milestones_select" ON ramp_milestones FOR SELECT USING (organization_id IS NULL OR organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
  CREATE POLICY "ramp_milestones_insert" ON ramp_milestones FOR INSERT WITH CHECK (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
  CREATE POLICY "ramp_milestones_update" ON ramp_milestones FOR UPDATE USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
  CREATE POLICY "ramp_milestones_delete" ON ramp_milestones FOR DELETE USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "ramp_deliveries_select" ON ramp_deliveries FOR SELECT USING (new_hire_id IN (SELECT id FROM new_hires WHERE organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())));
  CREATE POLICY "ramp_deliveries_insert" ON ramp_deliveries FOR INSERT WITH CHECK (new_hire_id IN (SELECT id FROM new_hires WHERE organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())));
  CREATE POLICY "ramp_deliveries_update" ON ramp_deliveries FOR UPDATE USING (new_hire_id IN (SELECT id FROM new_hires WHERE organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())));
  CREATE POLICY "ramp_deliveries_delete" ON ramp_deliveries FOR DELETE USING (new_hire_id IN (SELECT id FROM new_hires WHERE organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "access_requests_select" ON access_requests FOR SELECT USING (new_hire_id IN (SELECT id FROM new_hires WHERE organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())));
  CREATE POLICY "access_requests_insert" ON access_requests FOR INSERT WITH CHECK (new_hire_id IN (SELECT id FROM new_hires WHERE organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())));
  CREATE POLICY "access_requests_update" ON access_requests FOR UPDATE USING (new_hire_id IN (SELECT id FROM new_hires WHERE organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())));
  CREATE POLICY "access_requests_delete" ON access_requests FOR DELETE USING (new_hire_id IN (SELECT id FROM new_hires WHERE organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "readiness_items_select" ON readiness_items FOR SELECT USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
  CREATE POLICY "readiness_items_insert" ON readiness_items FOR INSERT WITH CHECK (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
  CREATE POLICY "readiness_items_update" ON readiness_items FOR UPDATE USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
  CREATE POLICY "readiness_items_delete" ON readiness_items FOR DELETE USING (organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "oauth_connections_user_all" ON oauth_connections FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  CREATE POLICY "oauth_provider_tokens_user_all" ON oauth_provider_tokens FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  CREATE POLICY "workspace_sources_user_all" ON workspace_sources FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  CREATE POLICY "usage_events_user_all" ON usage_events FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  CREATE POLICY "signal_runs_user_all" ON signal_runs FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  CREATE POLICY "signals_user_all" ON signals FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  CREATE POLICY "signal_evidence_user_all" ON signal_evidence FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "diff_event_raw_service_only" ON diff_event_raw FOR ALL USING (false) WITH CHECK (false);
  CREATE POLICY "diff_event_canonical_service_only" ON diff_event_canonical FOR ALL USING (false) WITH CHECK (false);
  CREATE POLICY "diff_daily_metrics_service_only" ON diff_daily_metrics FOR ALL USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
