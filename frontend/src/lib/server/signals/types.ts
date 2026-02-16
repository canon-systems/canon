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
  aku_distribution: Record<string, number>;
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
  aku_distribution: {
    current: Record<string, number>;
    baseline: Record<string, number>;
  };
};

export type SignalType =
  | 'regression_spike'
  | 'throughput_drop'
  | 'merge_drop'
  | 'repo_concentration'
  | 'aku_concentration';

export type SignalSeverity = 'elevated' | 'significant';

export type SignalScopeType = 'global' | 'repo' | 'aku';

export type SignalEvidenceRecord = {
  evidence_type: 'ticket' | 'pr' | 'repo' | 'aku' | 'metric';
  evidence_id: string;
  label?: string;
  rank: number;
  payload?: Record<string, unknown>;
};

export type SignalRecord = {
  id: string;
  created_at?: string;
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
  slack_channel: string | null;
  email_digest_enabled: boolean;
  email_digest_to: string | null;
  source_ids: string[];
};

export type ComputeMetricsInput = {
  userId: string;
  sourceIds: string[];
  window: MetricWindow;
};

export type SignalRunTrigger = 'manual' | 'scheduled' | 'weekly_digest' | 'daily_signal_monitor' | 'alert';

export type SignalRunResult = {
  runId: string;
  signals: SignalRecord[];
  comparison: MetricComparison;
};
