-- Store per-feature daily rollups alongside existing per-source metrics.

alter table if exists public.diff_daily_metrics
  add column if not exists feature_counts jsonb not null default '{}'::jsonb;

create index if not exists idx_diff_daily_metrics_feature_counts_gin
  on public.diff_daily_metrics
  using gin (feature_counts jsonb_path_ops);
