-- Add lightweight feature labels to workspace_sources for per-source inferred features.

alter table if exists public.workspace_sources
  add column if not exists feature_labels jsonb not null default '[]'::jsonb;

-- Optional index to query by label keys or names (case-insensitive).
create index if not exists idx_workspace_sources_feature_labels_gin
  on public.workspace_sources
  using gin (feature_labels jsonb_path_ops);
