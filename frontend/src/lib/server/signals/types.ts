export type MetricWindow = {
  start: string;
  end: string;
};

export type MetricSnapshot = {
  window: MetricWindow;
  tickets_completed: number;
  tickets_regressed: number;
  regression_rate: number;
  prs_opened: number;
  prs_merged: number;
  repos_touched: number;
  repo_distribution: Record<string, number>;
  domain_distribution: Record<string, number>;
};

export type MetricDelta = {
  metric_key: string;
  current_value: number;
  baseline_value: number;
  absolute_change: number;
  percent_change: number;
};

export type MetricComparison = {
  window_current: MetricWindow;
  window_baseline: MetricWindow;
  metrics: {
    tickets_completed: MetricDelta;
    tickets_regressed: MetricDelta;
    regression_rate: MetricDelta;
    prs_opened: MetricDelta;
    prs_merged: MetricDelta;
    repos_touched: MetricDelta;
  };
  repo_distribution: {
    current: Record<string, number>;
    baseline: Record<string, number>;
  };
  domain_distribution: {
    current: Record<string, number>;
    baseline: Record<string, number>;
  };
};

export type RobustBaselineStat = {
  median: number;
  mad: number;
  sigma: number;
  sample_size: number;
};

export type RobustSignalBaseline = {
  window_baseline: MetricWindow;
  history_windows: MetricWindow[];
  metrics: {
    tickets_completed: RobustBaselineStat;
    tickets_regressed: RobustBaselineStat;
    regression_rate: RobustBaselineStat;
    prs_merged: RobustBaselineStat;
  };
  repo_top_share: RobustBaselineStat;
  domain_top_share: RobustBaselineStat;
};

export type SignalType =
  | 'regression_spike'
  | 'throughput_drop'
  | 'merge_drop'
  | 'repo_concentration'
  | 'domain_concentration';

export type SignalSeverity = 'elevated' | 'significant';

export type SignalScopeType = 'global' | 'repo' | 'ticketing';

export type SignalEvidenceRecord = {
  evidence_type: 'ticket' | 'pr' | 'repo' | 'metric';
  evidence_id: string;
  label?: string;
  rank: number;
  payload?: Record<string, unknown>;
};

export type SignalRecord = {
  id: string;
  created_at?: string;
  signal_run_id?: string | null;
  primary_source_id?: string | null;
  type: SignalType;
  severity: SignalSeverity;
  scope_type: SignalScopeType;
  scope_id?: string | null;
  metric_key: string;
  window_start: string;
  window_end: string;
  baseline_start: string;
  baseline_end: string;
  current_value: number;
  baseline_value: number;
  absolute_change: number;
  percent_change: number;
  title: string;
  summary_line: string;
  metadata?: Record<string, unknown>;
  evidence: SignalEvidenceRecord[];
};

export type WorkspaceSignalSettings = {
  user_id: string;
  baseline_window_days: number;
  time_zone: string;
  slack_channel: string | null;
  email_digest_enabled: boolean;
  email_digest_to: string | null;
  delivery_preference: 'slack_only' | 'email_only' | 'slack_then_email';
  source_ids: string[];
};

export type ComputeMetricsInput = {
  userId: string;
  sourceIds: string[];
  window: MetricWindow;
};

export type SignalRunResult = {
  runId: string;
  signals: SignalRecord[];
  comparison: MetricComparison;
};
