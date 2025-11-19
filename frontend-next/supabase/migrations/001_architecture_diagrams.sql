-- Migration: Create architecture diagrams tables
-- Created: 2024

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: architecture_diagrams
CREATE TABLE IF NOT EXISTS architecture_diagrams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  -- Source identification
  repo_provider TEXT, -- 'github', etc.
  repo_url TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT 'main',
  subdir TEXT, -- optional subdirectory
  
  -- Diagram data
  detection_result JSONB NOT NULL, -- stores DetectionResult (tools, connections, detectedAt)
  diagram_markdown TEXT, -- generated Mermaid markdown
  diagram_svg TEXT, -- optional: rendered SVG for exports
  
  -- Metadata
  title TEXT NOT NULL, -- user-provided name for the diagram
  description TEXT,
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_checked_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Change tracking
  code_snapshot JSONB, -- commit SHA + file SHAs (similar to submissions)
  last_commit_sha TEXT, -- for detecting changes
  
  -- Export tracking
  exports JSONB DEFAULT '[]'::jsonb, -- array of {provider, resourceId, lastSyncedAt, autoSync: boolean}
  
  -- Polling configuration
  auto_update_enabled BOOLEAN DEFAULT false,
  check_interval_hours INTEGER DEFAULT 24 -- hours between checks
);

-- Table: architecture_diagram_versions (for versioning/history)
CREATE TABLE IF NOT EXISTS architecture_diagram_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diagram_id UUID REFERENCES architecture_diagrams(id) ON DELETE CASCADE NOT NULL,
  
  -- Version data (snapshot of diagram at this point)
  detection_result JSONB NOT NULL,
  diagram_markdown TEXT,
  code_snapshot JSONB,
  commit_sha TEXT,
  
  -- Version metadata
  version_number INTEGER NOT NULL, -- sequential version number
  created_at TIMESTAMPTZ DEFAULT NOW(),
  change_summary TEXT, -- e.g., "Added React, removed Express"
  
  -- Tool comparison (for showing growth)
  tools_added JSONB DEFAULT '[]'::jsonb, -- array of tool names
  tools_removed JSONB DEFAULT '[]'::jsonb,
  connections_added JSONB DEFAULT '[]'::jsonb,
  connections_removed JSONB DEFAULT '[]'::jsonb,
  
  UNIQUE(diagram_id, version_number)
);

-- Table: architecture_diagram_files (for detailed file tracking)
CREATE TABLE IF NOT EXISTS architecture_diagram_files (
  diagram_id UUID REFERENCES architecture_diagrams(id) ON DELETE CASCADE NOT NULL,
  file_path TEXT NOT NULL,
  file_hash TEXT,
  size_bytes INTEGER,
  file_type TEXT,
  PRIMARY KEY (diagram_id, file_path)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_architecture_diagrams_user_id ON architecture_diagrams(user_id);
CREATE INDEX IF NOT EXISTS idx_architecture_diagrams_repo_url ON architecture_diagrams(repo_url);
CREATE INDEX IF NOT EXISTS idx_architecture_diagrams_last_checked_at ON architecture_diagrams(last_checked_at);
CREATE INDEX IF NOT EXISTS idx_architecture_diagram_versions_diagram_id ON architecture_diagram_versions(diagram_id);
CREATE INDEX IF NOT EXISTS idx_architecture_diagram_versions_version_number ON architecture_diagram_versions(diagram_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_architecture_diagram_files_diagram_id ON architecture_diagram_files(diagram_id);

-- Row Level Security (RLS) Policies
ALTER TABLE architecture_diagrams ENABLE ROW LEVEL SECURITY;
ALTER TABLE architecture_diagram_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE architecture_diagram_files ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own diagrams
CREATE POLICY "Users can view their own diagrams"
  ON architecture_diagrams
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own diagrams"
  ON architecture_diagrams
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own diagrams"
  ON architecture_diagrams
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own diagrams"
  ON architecture_diagrams
  FOR DELETE
  USING (auth.uid() = user_id);

-- Policy: Users can only access versions of their own diagrams
CREATE POLICY "Users can view versions of their own diagrams"
  ON architecture_diagram_versions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM architecture_diagrams
      WHERE architecture_diagrams.id = architecture_diagram_versions.diagram_id
      AND architecture_diagrams.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert versions for their own diagrams"
  ON architecture_diagram_versions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM architecture_diagrams
      WHERE architecture_diagrams.id = architecture_diagram_versions.diagram_id
      AND architecture_diagrams.user_id = auth.uid()
    )
  );

-- Policy: Users can only access files of their own diagrams
CREATE POLICY "Users can view files of their own diagrams"
  ON architecture_diagram_files
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM architecture_diagrams
      WHERE architecture_diagrams.id = architecture_diagram_files.diagram_id
      AND architecture_diagrams.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert files for their own diagrams"
  ON architecture_diagram_files
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM architecture_diagrams
      WHERE architecture_diagrams.id = architecture_diagram_files.diagram_id
      AND architecture_diagrams.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update files for their own diagrams"
  ON architecture_diagram_files
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM architecture_diagrams
      WHERE architecture_diagrams.id = architecture_diagram_files.diagram_id
      AND architecture_diagrams.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete files for their own diagrams"
  ON architecture_diagram_files
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM architecture_diagrams
      WHERE architecture_diagrams.id = architecture_diagram_files.diagram_id
      AND architecture_diagrams.user_id = auth.uid()
    )
  );

