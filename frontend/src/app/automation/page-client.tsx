'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Zap, Plus, CheckCircle2, XCircle, Clock, Loader2, GitBranch, ExternalLink, TrendingUp, ChevronDown, Github, Trash2, X, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { User as SupabaseUser } from '@supabase/supabase-js';

// Import all the automation types and interfaces from settings
interface Connection {
  id: string;
  provider: string;
  connection_id: string;
  status: string;
  metadata: any;
  created_at: string;
  updated_at: string;
}

interface Repo {
  id: string;
  name: string;
  provider: string;
  repo_url: string;
  default_branch: string;
  auth_type: string;
  credentials_ref?: string;
  settings?: any;
  created_at: string;
  updated_at: string;
}

interface AutomationRulesResponse {
  automation_rules: Array<Record<string, any>>;
  automation_metadata: Record<string, any>;
}

interface AutomationRuleForm {
  id: string;
  name: string;
  enabled: boolean;
  customCron: string;
  customScheduleDescription?: string;

  // NEW: Smart automation with presets
  action_preset: 'docs_only' | 'diagrams_only' | 'docs_and_diagrams' | 'full_auto_publish';

  // NEW: Significance analysis (always enabled)
  significance_sensitivity: 'strict' | 'balanced' | 'lenient';
  significance_minimum_confidence: 'high' | 'medium' | 'low';
  significance_analysis_enabled?: boolean;

  // NEW: Scope targeting
  target_documents: string[]; // Empty = all documents
  target_diagrams: string[];  // Empty = all diagrams

  // NEW: Notifications
  notifications_email_enabled: boolean;
  notifications_include_preview_links: boolean;

  // NEW: Auto-publish configuration
  auto_publish_max_changes?: string;
  auto_publish_max_change_percentage?: string;
  auto_publish_target_provider?: string;
  auto_publish_target_connection_id?: string;
  auto_publish_target_resource_id?: string;
  auto_publish_custom_resource?: string;
  publish_targets?: Record<string, any>;

  // LEGACY: Keep for backward compatibility
  detect_changes?: boolean;
  generate_doc?: boolean;
  generate_diagram?: boolean;
  auto_publish?: boolean;
  auto_publish_new_docs?: boolean;
}

type AutomationAlert = {
  type: 'success' | 'error';
  message: string;
} | null;

interface AutomationPageClientProps {
  user: SupabaseUser | null;
  repos: Repo[];
  connections: Connection[];
  allRules: Array<{
    repoId: string;
    repoName: string;
    repoUrl: string;
    ruleId: string;
    ruleName: string;
    enabled: boolean;
    action_preset?: string;
    schedule?: string;
    lastRunAt?: string;
    lastRunStatus?: string;
    lastExecution?: any;
  }>;
  stats: {
    totalRules: number;
    activeRules: number;
    executions24h: number;
    successRate: number;
  };
}

const KNOWLEDGE_BASE_PROVIDERS = new Set<string>(['notion', 'confluence', 'coda']);

function normalizeProviderName(provider?: string | null) {
  if (!provider) return '';
  return provider.trim().toLowerCase();
}

function isKnowledgeBaseProvider(provider?: string | null) {
  const normalizedProvider = normalizeProviderName(provider);
  return normalizedProvider ? KNOWLEDGE_BASE_PROVIDERS.has(normalizedProvider) : false;
}

function getProviderDisplayName(provider: string) {
  if (provider === 'googledocs' || provider === 'google-docs') return 'Google Docs';
  if (provider === 'github') return 'GitHub';
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function isValidCron(cron: string): boolean {
  try {
    const parts = cron.trim().split(/\s+/);
    return parts.length === 5 && parts.every(part => part.length > 0);
  } catch (error) {
    return false;
  }
}

function getCronDescription(cron: string): string {
  try {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return 'Invalid cron expression';

    const [minute, hour, day, month, weekday] = parts;

    // Common patterns
    if (cron === '0 2 * * *') return 'Daily at 2:00 AM UTC';
    if (cron === '0 9 * * *') return 'Daily at 9:00 AM UTC';
    if (cron === '0 0 * * *') return 'Daily at midnight UTC';
    if (cron === '*/30 * * * *') return 'Every 30 minutes';
    if (cron === '*/15 * * * *') return 'Every 15 minutes';
    if (cron === '0 * * * *') return 'Every hour';
    if (cron === '0 */6 * * *') return 'Every 6 hours';
    if (cron === '0 */12 * * *') return 'Every 12 hours';
    if (cron === '0 9 * * 1') return 'Weekly on Monday at 9:00 AM UTC';
    if (cron === '0 0 * * 1') return 'Weekly on Monday at midnight UTC';

    // Generic descriptions
    let description = '';

    if (minute === '0' && hour !== '*' && hour !== '*/1') {
      const hourNum = parseInt(hour);
      if (hourNum >= 0 && hourNum <= 23) {
        const hour12 = hourNum === 0 ? 12 : hourNum > 12 ? hourNum - 12 : hourNum;
        const ampm = hourNum >= 12 ? 'PM' : 'AM';
        description = `Daily at ${hour12}:00 ${ampm} UTC`;
      }
    } else if (minute === '*/30') {
      description = 'Every 30 minutes';
    } else if (minute === '*/15') {
      description = 'Every 15 minutes';
    } else if (hour === '*/6') {
      description = 'Every 6 hours';
    } else if (hour === '*/12') {
      description = 'Every 12 hours';
    } else {
      description = `Custom schedule: ${cron}`;
    }

    return description;
  } catch (error) {
    return 'Invalid cron expression';
  }
}

export function AutomationPageClient({ repos, connections: initialConnections, allRules: initialAllRules, stats: initialStats }: AutomationPageClientProps) {
  const supabase = createClient();

  const [reposList, setReposList] = useState<Repo[]>(repos);
  const [connections, setConnections] = useState<Connection[]>(initialConnections);
  const [allRules, setAllRules] = useState(initialAllRules);
  const [stats, setStats] = useState(initialStats);
  const [activeAutomationRepoId, setActiveAutomationRepoId] = useState<string | null>(null);
  const [automationLoading, setAutomationLoading] = useState<Record<string, boolean>>({});
  const [automationSaving, setAutomationSaving] = useState<Record<string, boolean>>({});
  // Single rule form state (one rule per repo)
  const [singleRuleForm, setSingleRuleForm] = useState<AutomationRuleForm | null>(null);
  const [automationAlerts, setAutomationAlerts] = useState<Record<string, AutomationAlert>>({});
  const [providerResources, setProviderResources] = useState<Record<string, Array<{ id: string; name: string }>>>({});
  const [providerResourceLoading, setProviderResourceLoading] = useState<Record<string, boolean>>({});
  const [providerResourceErrors, setProviderResourceErrors] = useState<Record<string, string>>({});

  // Repository management state
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repoError, setRepoError] = useState('');
  const [repoSuccess, setRepoSuccess] = useState('');

  // Tab management

  // Track expanded repository rows to show automation rules inline
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Delete confirmation modals
  const [deleteRuleModal, setDeleteRuleModal] = useState<{ open: boolean; repoId: string | null; ruleId: string | null; ruleName: string }>({ open: false, repoId: null, ruleId: null, ruleName: '' });
  const [deleting, setDeleting] = useState(false);

  // Manual rule execution state
  const [runningRules, setRunningRules] = useState<Record<string, boolean>>({});
  const [runResults, setRunResults] = useState<Record<string, {
    success: boolean;
    message: string;
    docId?: string | null;
    diagramId?: string | null;
    actions?: string[];
    errors?: string[];
    stats?: {
      filesProcessed: number;
      documentsUpdated: number;
      documentsCreated: number;
      timeElapsed: number;
    };
    timestamp?: number;
  } | null>>({});

  // Smart Alerts & Notifications
  const [alerts, setAlerts] = useState<Array<{
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
    details?: string;
    timestamp: number;
    expanded?: boolean;
    actions?: Array<{
      label: string;
      action: () => void;
      variant?: 'primary' | 'secondary';
    }>;
  }>>([]);

  // Real-time execution dashboard state
  const [executionDashboard, setExecutionDashboard] = useState<{
    open: boolean;
    repoId: string;
    ruleId: string;
    ruleName: string;
    repoName: string;
    progress: {
      phase: string;
      progress: number;
      status: string;
      details?: string;
      startTime: number;
    };
    completed: boolean;
    result?: any;
  } | null>(null);

  // Abort controllers for cancelling running rules
  const abortControllersRef = useRef<Record<string, AbortController>>({});

  // Alert management functions
  const addAlert = (alert: Omit<typeof alerts[0], 'id' | 'timestamp'>) => {
    const newAlert = {
      ...alert,
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
    };
    setAlerts(prev => [newAlert, ...prev]);

    // Auto-dismiss after 8 seconds for success/info, 12 seconds for warnings/errors
    const dismissTime = alert.type === 'success' || alert.type === 'info' ? 8000 : 12000;
    setTimeout(() => {
      dismissAlert(newAlert.id);
    }, dismissTime);
  };

  const dismissAlert = (id: string) => {
    setAlerts(prev => prev.filter(alert => alert.id !== id));
  };

  const toggleAlertExpansion = (id: string) => {
    setAlerts(prev => prev.map(alert =>
      alert.id === id ? { ...alert, expanded: !alert.expanded } : alert
    ));
  };

  const clearAllAlerts = () => {
    setAlerts([]);
  };

  // Load repos on mount
  useEffect(() => {
    loadRepos();
    loadConnections();
  }, []);

  // Update stats by fetching fresh data from server
  async function updateStatsFromRules() {
    try {
      // Fetch fresh automation rules from all repos
      const { data: rules } = await supabase
        .from('automation_rules')
        .select(`
          *,
          workspace_repos!inner(id, name, repo_url)
        `);

      // Calculate stats from fresh data
      let totalRules = 0;
      let activeRules = 0;

      const freshAllRules: typeof allRules = [];

      rules?.forEach((rule: any) => {
        const enabled = Boolean(rule.enabled);
        totalRules++;
        if (enabled) activeRules++;

        freshAllRules.push({
          repoId: rule.repo_id,
          repoName: rule.workspace_repos.name || 'Untitled Repo',
          repoUrl: rule.workspace_repos.repo_url || '',
          ruleId: rule.rule_id,
          ruleName: rule.ruleName || rule.rule_id,
          enabled,
          action_preset: rule.action_preset,
          schedule: rule.schedule,
          lastRunAt: rule.last_run_at,
          lastRunStatus: rule.last_run_status,
        });
      });

      // Update local allRules state with fresh data
      setAllRules(freshAllRules);

      // Fetch execution statistics from automation_runs table
      let totalExecutions24h = 0;
      let successfulExecutions = 0;

      try {
        const response = await fetch('/api/automation/stats');
        if (response.ok) {
          const stats = await response.json();
          totalExecutions24h = stats.executions24h || 0;
          successfulExecutions = stats.successfulExecutions || 0;
        }
      } catch (error) {
        console.error('Failed to fetch automation stats:', error);
      }

      const successRate = totalExecutions24h > 0
        ? Math.round((successfulExecutions / totalExecutions24h) * 100)
        : 0;

      setStats({
        totalRules,
        activeRules,
        executions24h: totalExecutions24h,
        successRate,
      });
    } catch (error) {
      console.error('Failed to update stats from rules:', error);
    }
  }

  async function loadRepos() {
    setLoadingRepos(true);
    try {
      const response = await fetch('/api/repos');
      if (!response.ok) throw new Error('Failed to load repositories');
      const data = await response.json();
      setReposList(data || []);
      // Recalculate rules and stats from the fetched repos data
      updateStatsFromRules();
    } catch (err: any) {
      setRepoError(err.message || 'Failed to load repositories');
      setTimeout(() => setRepoError(''), 5000);
    } finally {
      setLoadingRepos(false);
    }
  }

  function parseRepoUrl(url: string): { owner: string; repo: string } | null {
    try {
      const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (match) {
        return { owner: match[1], repo: match[2].replace('.git', '') };
      }
    } catch {
      // Invalid URL
    }
    return null;
  }



  async function handleDeleteRule(repoId: string, ruleId: string) {
    setDeleting(true);
    setRepoError('');
    try {
      // Get current rules
      const response = await fetch(`/api/repos/${repoId}/automation`, {
        method: 'GET',
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to load automation rules');
      }
      const data = await response.json();
      const currentRules = data.automation_rules || [];

      // Remove the rule
      const updatedRules = currentRules.filter((r: any) => (r.id || r.name) !== ruleId);

      // Update rules
      const updateResponse = await fetch(`/api/repos/${repoId}/automation`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ automation_rules: updatedRules }),
      });

      if (!updateResponse.ok) {
        const errorData = await updateResponse.json();
        throw new Error(errorData.error || errorData.detail || 'Failed to delete rule');
      }

      setDeleteRuleModal({ open: false, repoId: null, ruleId: null, ruleName: '' });
      setRepoSuccess('Rule deleted successfully!');
      setTimeout(() => setRepoSuccess(''), 5000);

      // Refresh automation rules
      if (activeAutomationRepoId === repoId) {
        await fetchAutomationRules(repoId);
      }

      // Update stats (which will fetch fresh data and update allRules state)
      updateStatsFromRules();
    } catch (err: any) {
      setRepoError(err.message || 'Failed to delete rule');
      setTimeout(() => setRepoError(''), 5000);
    } finally {
      setDeleting(false);
    }
  }

  async function handleRunRule(repoId: string, ruleId: string) {
    const key = `${repoId}-${ruleId}`;

    // Find rule and repo info
    const repo = reposList.find(r => r.id === repoId);
    const rule = allRules.find(r => r.repoId === repoId && r.ruleId === ruleId);

    if (!repo || !rule) return;

    // Create abort controller for this run
    const abortController = new AbortController();
    abortControllersRef.current[key] = abortController;

    setRunningRules((prev) => ({ ...prev, [key]: true }));
    setRunResults((prev) => ({ ...prev, [key]: null }));

    // Initialize execution dashboard
    setExecutionDashboard({
      open: true,
      repoId,
      ruleId,
      ruleName: rule.ruleName,
      repoName: repo.name,
      progress: {
        phase: 'detecting',
        progress: 0,
        status: 'Starting automation execution...',
        details: 'Initializing...',
        startTime: Date.now(),
      },
      completed: false,
    });

    let progressInterval: NodeJS.Timeout | null = null;

    try {
      // Simulate progress updates (in a real implementation, you'd get progress from the server)
      progressInterval = setInterval(() => {
        setExecutionDashboard(prev => {
          if (!prev || prev.completed) return prev;

          let newProgress = { ...prev.progress };
          let newPhase = prev.progress.phase;

          // Progress simulation based on time elapsed
          const elapsed = Date.now() - prev.progress.startTime;
          const progressPercent = Math.min(95, (elapsed / 10000) * 100); // Assume 10 seconds total

          if (elapsed < 2000) {
            newPhase = 'detecting';
            newProgress = {
              ...newProgress,
              phase: 'detecting',
              progress: Math.min(25, progressPercent),
              status: 'Detecting repository changes...',
              details: 'Scanning for file modifications',
            };
          } else if (elapsed < 5000) {
            newPhase = 'processing';
            newProgress = {
              ...newProgress,
              phase: 'processing',
              progress: Math.min(60, progressPercent),
              status: 'Processing changed files...',
              details: 'Analyzing and summarizing file changes',
            };
          } else if (elapsed < 8000) {
            newPhase = 'updating';
            newProgress = {
              ...newProgress,
              phase: 'updating',
              progress: Math.min(85, progressPercent),
              status: 'Updating documentation...',
              details: 'Regenerating affected documents',
            };
          } else {
            newPhase = 'publishing';
            newProgress = {
              ...newProgress,
              phase: 'publishing',
              progress: progressPercent,
              status: 'Publishing content...',
              details: 'Sending updates to knowledge bases',
            };
          }

          return {
            ...prev,
            progress: newProgress,
          };
        });
      }, 500);

      const response = await fetch(`/api/repos/${repoId}/automation/run`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleId }),
        signal: abortController.signal,
      });

      if (progressInterval) clearInterval(progressInterval);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.detail || 'Failed to run automation rule');
      }

      // Build result message
      let message = '';
      if (data.skipped) {
        message = `Skipped: ${data.skipReason || 'No changes detected'}`;
      } else if (data.success) {
        const actions = data.actions?.length > 0 ? data.actions.join(', ') : 'completed';
        message = `Success: ${actions}`;
      } else {
        message = `Failed: ${data.errors?.join(', ') || 'Unknown error'}`;
      }

      const result = {
        success: data.success && !data.skipped,
        message,
        docId: data.docId,
        diagramId: data.diagramId,
        actions: data.actions,
        errors: data.errors,
        stats: data.stats,
        timestamp: Date.now(),
      };

      setRunResults((prev) => ({ ...prev, [key]: result }));

      // Update execution dashboard with completion
      setExecutionDashboard(prev => prev ? {
        ...prev,
        progress: {
          ...prev.progress,
          progress: 100,
          status: result.success ? 'Execution completed successfully' : 'Execution completed with errors',
          details: message,
        },
        completed: true,
        result,
      } : null);

      // Create smart alert
      const alertType = result.success ? 'success' : data.skipped ? 'warning' : 'error';
      const alertTitle = result.success ? 'Automation completed successfully' :
        data.skipped ? 'Automation skipped' : 'Automation failed';

      let alertDetails = '';
      if (result.stats) {
        alertDetails = `Processed ${result.stats.filesProcessed || 0} files, updated ${result.stats.documentsUpdated || 0} documents in ${result.stats.timeElapsed || 0}s`;
      }

      addAlert({
        type: alertType,
        title: alertTitle,
        message,
        details: alertDetails,
        actions: result.success ? [
          {
            label: 'View Results',
            action: () => {
              // Could open a detailed results modal here
              console.log('View detailed results', result);
            }
          }
        ] : undefined,
      });

      // Auto-clear result after 10 seconds
      setTimeout(() => {
        setRunResults((prev) => ({ ...prev, [key]: null }));
      }, 10000);

      // Refresh to update stats
      await loadRepos();
    } catch (err: any) {
      if (progressInterval) clearInterval(progressInterval);

      // Check if this was a cancellation
      if (err.name === 'AbortError') {
        const cancelResult = {
          success: false,
          message: 'Run cancelled by user',
        };
        setRunResults((prev) => ({ ...prev, [key]: cancelResult }));
        setExecutionDashboard(prev => prev ? {
          ...prev,
          progress: {
            ...prev.progress,
            status: 'Execution cancelled',
            details: 'Run was cancelled by user',
          },
          completed: true,
          result: cancelResult,
        } : null);

        addAlert({
          type: 'warning',
          title: 'Automation cancelled',
          message: 'The automation rule execution was cancelled by user request.',
        });
      } else {
        const errorResult = {
          success: false,
          message: err.message || 'Failed to run rule',
        };
        setRunResults((prev) => ({ ...prev, [key]: errorResult }));
        setExecutionDashboard(prev => prev ? {
          ...prev,
          progress: {
            ...prev.progress,
            status: 'Execution failed',
            details: err.message || 'Unknown error occurred',
          },
          completed: true,
          result: errorResult,
        } : null);

        addAlert({
          type: 'error',
          title: 'Automation failed',
          message: err.message || 'An unexpected error occurred during automation execution.',
          details: 'Check your repository setup and try again. If the problem persists, contact support.',
          actions: [
            {
              label: 'Retry',
              action: () => handleRunRule(repoId, ruleId),
              variant: 'primary'
            }
          ],
        });
      }

      // Auto-clear error after 10 seconds
      setTimeout(() => {
        setRunResults((prev) => ({ ...prev, [key]: null }));
      }, 10000);
    } finally {
      setRunningRules((prev) => ({ ...prev, [key]: false }));
      // Clean up abort controller
      delete abortControllersRef.current[key];
    }
  }

  async function handleCancelRule(repoId: string, ruleId: string) {
    const key = `${repoId}-${ruleId}`;
    const controller = abortControllersRef.current[key];
    if (controller) {
      controller.abort();

      // Update execution dashboard
      setExecutionDashboard(prev => prev ? {
        ...prev,
        progress: {
          ...prev.progress,
          status: 'Cancelling execution...',
          details: 'Sending cancellation request',
        },
      } : null);

      // Record the cancellation in execution history
      try {
        await fetch(`/api/repos/${repoId}/automation/cancel`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ruleId }),
        });

        // Refresh to show the cancelled run in the logs
        await loadRepos();
      } catch (err) {
        console.error('Failed to record cancellation:', err);
      }
    }
  }

  async function loadConnections() {
    try {
      const response = await fetch('/api/integrations/list');
      if (!response.ok) throw new Error('Failed to load connections');
      const data = await response.json();
      setConnections(data.connections || []);
    } catch (err: any) {
      console.error('Failed to load connections:', err);
    }
  }

  // All the automation helper functions from settings (extracted)
  function createAutomationRuleForm(overrides: Partial<AutomationRuleForm> = {}): AutomationRuleForm {
    return {
      id: overrides.id ?? `rule-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: overrides.name ?? '',
      enabled: overrides.enabled ?? false,
      customCron: overrides.customCron ?? '0 2 * * *',
      // NEW: Smart automation defaults
      action_preset: overrides.action_preset ?? 'docs_and_diagrams',
      significance_sensitivity: overrides.significance_sensitivity ?? 'balanced',
      significance_minimum_confidence: overrides.significance_minimum_confidence ?? 'medium',
      target_documents: overrides.target_documents ?? [],
      target_diagrams: overrides.target_diagrams ?? [],
      notifications_email_enabled: overrides.notifications_email_enabled ?? true,
      notifications_include_preview_links: overrides.notifications_include_preview_links ?? true,

      // LEGACY: Keep for backward compatibility (not displayed in UI)
      detect_changes: true, // Always true for smart automation
      generate_doc: overrides.generate_doc ?? true,
      generate_diagram: overrides.generate_diagram ?? false,
      auto_publish: overrides.auto_publish ?? false,
      auto_publish_new_docs: overrides.auto_publish_new_docs ?? false,
      significance_analysis_enabled: true, // Always true for smart automation
      auto_publish_max_changes: overrides.auto_publish_max_changes ?? '50',
      auto_publish_max_change_percentage: overrides.auto_publish_max_change_percentage ?? '5',
      auto_publish_target_provider: overrides.auto_publish_target_provider ?? '',
      auto_publish_target_connection_id: overrides.auto_publish_target_connection_id ?? '',
      auto_publish_target_resource_id: overrides.auto_publish_target_resource_id ?? '',
      auto_publish_custom_resource: overrides.auto_publish_custom_resource ?? '',
      publish_targets: overrides.publish_targets ?? {}
    };
  }

  function parseSchedule(rule: Record<string, any>): {
    customCron: string;
    customScheduleDescription: string;
  } {
    const raw = (rule.schedule || '').trim();
    // For cron-only schedules, just use the raw value as the cron expression
    // Remove any 'cron:' prefix if it exists for backward compatibility
    const cron = raw.startsWith('cron:') ? raw.replace(/^cron:/, '') : raw;
    return {
      customCron: cron || '0 2 * * *', // Default to daily at 2 AM
      customScheduleDescription: rule?.custom_schedule_description ?? ''
    };
  }

  function mapRulesToForms(rules: Record<string, any>[]): AutomationRuleForm[] {
    if (!Array.isArray(rules)) return [];
    return rules.map((rule, index) => {
      const schedule = parseSchedule(rule);

      // NEW: Smart automation - determine preset from legacy fields or use new format
      let action_preset = rule.action_preset;
      if (!action_preset) {
        // Infer preset from legacy fields
        if (rule.generate_doc && rule.generate_diagram && rule.auto_publish) {
          action_preset = 'full_auto_publish';
        } else if (rule.generate_doc && rule.generate_diagram) {
          action_preset = 'docs_and_diagrams';
        } else if (rule.generate_diagram) {
          action_preset = 'diagrams_only';
        } else {
          action_preset = 'docs_only';
        }
      }

      return createAutomationRuleForm({
        id: rule.id || `rule-${index}-${Date.now()}`,
        name: rule.name ?? '',
        enabled: rule.enabled ?? false,
        customCron: schedule.customCron,

        // NEW: Smart automation fields
        action_preset,
        significance_sensitivity: rule.significance_analysis?.sensitivity || 'balanced',
        significance_minimum_confidence: rule.significance_analysis?.minimum_confidence || 'medium',
        target_documents: rule.target_documents || [],
        target_diagrams: rule.target_diagrams || [],
        notifications_email_enabled: rule.notifications?.email_enabled ?? true,
        notifications_include_preview_links: rule.notifications?.include_preview_links ?? true,

        // LEGACY: Keep for backward compatibility (not displayed in UI)
        detect_changes: true, // Always true for smart automation
        generate_doc: rule.generate_doc ?? true,
        generate_diagram: rule.generate_diagram ?? false,
        auto_publish: rule.auto_publish ?? false,
        auto_publish_new_docs: rule.auto_publish_new_docs ?? false,
        significance_analysis_enabled: true, // Always true for smart automation
        auto_publish_max_changes: rule.auto_publish_max_changes?.toString() ?? '50',
        auto_publish_max_change_percentage: rule.auto_publish_max_change_percentage?.toString() ?? '5',
        auto_publish_target_provider: rule?.auto_publish_target?.provider ?? '',
        auto_publish_target_connection_id: rule?.auto_publish_target?.connection_id ?? '',
        auto_publish_target_resource_id: rule?.auto_publish_target?.resource_id ?? '',
        auto_publish_custom_resource: '',
        publish_targets: rule.publish_targets || {}
      });
    });
  }



  function getConnectionById(connectionId: string) {
    return connections.find((connection) => connection.connection_id === connectionId || connection.id === connectionId);
  }

  function getResourcesForConnection(connectionId: string) {
    const connection = getConnectionById(connectionId);
    if (!connection) return [];
    const normalizedProvider = normalizeProviderName(connection.provider);
    const cached = normalizedProvider ? providerResources[normalizedProvider] : undefined;
    if (cached && cached.length > 0) return cached;
    const raw = connection?.metadata?.resources || connection?.metadata?.targets || [];
    if (!raw || !Array.isArray(raw)) return [];
    return raw
      .map((item: any) => {
        if (!item) return null;
        if (typeof item === 'string') return { id: item, name: item };
        const id = item.resource_id || item.id || item.name;
        const name = item.name || item.label || item.resource_id || item.id;
        if (!id) return null;
        return { id, name: name || id };
      })
      .filter(Boolean) as Array<{ id: string; name: string }>;
  }

  async function loadResourcesForProvider(provider: string) {
    const normalizedProvider = normalizeProviderName(provider);
    if (!normalizedProvider || !isKnowledgeBaseProvider(normalizedProvider)) return;
    if (providerResourceLoading[normalizedProvider]) return;
    if (providerResources[normalizedProvider]?.length && !providerResourceErrors[normalizedProvider]) return;

    setProviderResourceLoading((prev) => ({ ...prev, [normalizedProvider]: true }));
    setProviderResourceErrors((prev) => ({ ...prev, [normalizedProvider]: '' }));

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const params = new URLSearchParams({ provider: normalizedProvider });
      const response = await fetch(`/api/push/resources?${params.toString()}`, {
        method: 'GET',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.detail || 'Failed to load resources');

      const normalized = (result.resources || [])
        .map((resource: any) => {
          const id = resource.id || resource.resource_id || resource.page_id;
          const name = resource.title || resource.name || resource.label || resource.url || resource.id || resource.resource_id || 'Untitled resource';
          return id ? { id, name } : null;
        })
        .filter(Boolean) as Array<{ id: string; name: string }>;

      setProviderResources((prev) => ({ ...prev, [normalizedProvider]: normalized }));
    } catch (err: any) {
      console.error('Failed to load resources for provider', provider, err);
      setProviderResourceErrors((prev) => ({ ...prev, [normalizedProvider]: err?.message || 'Failed to load resources' }));
    } finally {
      setProviderResourceLoading((prev) => ({ ...prev, [normalizedProvider]: false }));
    }
  }

  function setRuleConnection(connectionId: string, provider: string) {
    if (!singleRuleForm) return;
    const normalizedProvider = normalizeProviderName(provider);
    setSingleRuleForm({
      ...singleRuleForm,
      auto_publish_target_connection_id: connectionId,
      auto_publish_target_provider: normalizedProvider,
      auto_publish_target_resource_id: '',
      auto_publish_custom_resource: ''
    });
    if (normalizedProvider && isKnowledgeBaseProvider(normalizedProvider)) {
      loadResourcesForProvider(normalizedProvider);
    }
  }

  function updateSingleRuleField(field: keyof AutomationRuleForm, value: AutomationRuleForm[keyof AutomationRuleForm]) {
    if (!singleRuleForm) return;
    setSingleRuleForm({ ...singleRuleForm, [field]: value });
  }

  function toggleExpandedRow(repoId: string) {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(repoId)) {
        newSet.delete(repoId);
      } else {
        newSet.add(repoId);
      }
      return newSet;
    });
  }


  function buildScheduleValue(form: AutomationRuleForm) {
    // Simply return the cron expression directly
    return form.customCron.trim() || '0 0 * * *';
  }

  function formToRule(form: AutomationRuleForm) {
    // NEW: Smart automation rule structure
    const rule: Record<string, any> = {
      id: form.id,
      name: form.name?.trim() || 'Smart Automation',
      enabled: form.enabled,
      schedule: buildScheduleValue(form),

      // Smart automation fields
      action_preset: form.action_preset,
      significance_analysis: {
        sensitivity: form.significance_sensitivity,
        minimum_confidence: form.significance_minimum_confidence,
      },
      target_documents: form.target_documents || [],
      target_diagrams: form.target_diagrams || [],
      notifications: {
        email_enabled: form.notifications_email_enabled,
        include_preview_links: form.notifications_include_preview_links,
      },
      publish_targets: form.publish_targets || {},
    };

    // Save provider and resource selections for persistence
    if (form.auto_publish_target_provider || form.auto_publish_target_connection_id || form.auto_publish_target_resource_id) {
      rule.auto_publish_target = {
        provider: form.auto_publish_target_provider || undefined,
        connection_id: form.auto_publish_target_connection_id || undefined,
        resource_id: form.auto_publish_target_resource_id || undefined,
      };
    }

    if (form.customScheduleDescription?.trim()) {
      rule.custom_schedule_description = form.customScheduleDescription.trim();
    }

    // LEGACY: Keep for backward compatibility during migration
    rule.detect_changes = true; // Always true for smart automation
    rule.generate_doc = ['docs_only', 'docs_and_diagrams', 'full_auto_publish'].includes(form.action_preset);
    rule.generate_diagram = ['diagrams_only', 'docs_and_diagrams', 'full_auto_publish'].includes(form.action_preset);
    rule.auto_publish = form.action_preset === 'full_auto_publish';
    rule.auto_publish_new_docs = false; // Never auto-publish new docs in smart automation

    return rule;
  }


  async function fetchAutomationRules(repoId: string) {
    setAutomationLoading((prev) => ({ ...prev, [repoId]: true }));
    setAutomationAlerts((prev) => ({ ...prev, [repoId]: null }));

    try {
      const response = await fetch(`/api/repos/${repoId}/automation`, { method: 'GET', credentials: 'include' });
      if (!response.ok) {
        const errorDetail = await response.json().catch(() => null);
        throw new Error(errorDetail?.error || errorDetail?.detail || 'Failed to load automation rules');
      }

      const data = await response.json();
      const forms = mapRulesToForms(data.automation_rules || []);
      // For single rule mode, use the first rule or create a new one
      setSingleRuleForm(forms.length > 0 ? forms[0] : createAutomationRuleForm());
    } catch (error: any) {
      setAutomationAlerts((prev) => ({ ...prev, [repoId]: { type: 'error', message: error?.message || 'Failed to load automation rules' } }));
    } finally {
      setAutomationLoading((prev) => ({ ...prev, [repoId]: false }));
    }
  }

  async function handleSaveAutomationRules(repoId: string) {
    if (!singleRuleForm) return;

    // Use the current enabled state from the form
    const parsed = [formToRule(singleRuleForm)];

    setAutomationSaving((prev) => ({ ...prev, [repoId]: true }));
    setAutomationAlerts((prev) => ({ ...prev, [repoId]: null }));

    try {
      const response = await fetch(`/api/repos/${repoId}/automation`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ automation_rules: parsed })
      });

      if (!response.ok) {
        const errorDetail = await response.json().catch(() => null);
        throw new Error(errorDetail?.error || errorDetail?.detail || 'Failed to save automation rule');
      }

      const updated = await response.json();
      const nextForms = mapRulesToForms(updated.automation_rules || []);
      setSingleRuleForm(nextForms.length > 0 ? nextForms[0] : createAutomationRuleForm());

      // Update stats (which will fetch fresh data and update allRules state)
      updateStatsFromRules();

      addAlert({
        type: 'success',
        title: 'Automation rule saved',
        message: `Successfully configured automation for ${activeAutomationRepo?.name}`,
        details: 'Your automation rule is now active and will run according to the schedule.',
      });

      // Close the modal after successful save
      setActiveAutomationRepoId(null);
    } catch (error: any) {
      addAlert({
        type: 'error',
        title: 'Failed to save automation rule',
        message: error?.message || 'An error occurred while saving your automation configuration.',
        details: 'Please check your settings and try again. If the problem continues, contact support.',
        actions: [
          {
            label: 'Try Again',
            action: () => handleSaveAutomationRules(repoId),
            variant: 'primary'
          }
        ],
      });
    } finally {
      setAutomationSaving((prev) => ({ ...prev, [repoId]: false }));
    }
  }

  async function toggleRuleEnabled(repoId: string, ruleId: string) {
    try {
      // Fetch current rules from API
      const rulesResponse = await fetch(`/api/repos/${repoId}/automation`);
      if (!rulesResponse.ok) {
        throw new Error('Failed to fetch current rules');
      }

      const rulesData = await rulesResponse.json();
      const currentRules = rulesData.automation_rules || [];

      // Find and toggle the rule
      const ruleIndex = currentRules.findIndex((r: any) => r.id === ruleId);
      if (ruleIndex === -1) return;

      const enabled = !currentRules[ruleIndex].enabled;

      const updatedRules = [...currentRules];
      updatedRules[ruleIndex] = {
        ...updatedRules[ruleIndex],
        enabled
      };

      // Send the update to the server
      const response = await fetch(`/api/repos/${repoId}/automation`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ automation_rules: updatedRules })
      });

      if (!response.ok) {
        throw new Error('Failed to update rule status');
      }

      // Update stats (which will fetch fresh data and update allRules state)
      updateStatsFromRules();

      addAlert({
        type: 'info',
        title: `Rule ${enabled ? 'enabled' : 'disabled'}`,
        message: `Automation rule "${currentRules[ruleIndex].name || currentRules[ruleIndex].id}" has been ${enabled ? 'enabled' : 'disabled'}.`,
      });

    } catch (error: any) {
      console.error('Failed to toggle rule enabled state:', error);
      setAutomationAlerts((prev) => ({
        ...prev,
        [repoId]: { type: 'error', message: error.message || 'Failed to update rule' }
      }));
    }
  }

  async function toggleAllRulesEnabled(repoId: string) {
    try {
      // Fetch current rules from API
      const rulesResponse = await fetch(`/api/repos/${repoId}/automation`);
      if (!rulesResponse.ok) {
        throw new Error('Failed to fetch current rules');
      }

      const rulesData = await rulesResponse.json();
      const currentRules = rulesData.automation_rules || [];

      if (currentRules.length === 0) {
        // No rules to toggle, just return
        return;
      }

      // Check if all rules are currently enabled
      const allEnabled = currentRules.every((rule: any) => rule.enabled);
      const newEnabledState = !allEnabled;

      // Update all rules to the new state
      const updatedRules = currentRules.map((rule: any) => ({
        ...rule,
        enabled: newEnabledState
      }));

      // Send the update to the server
      const response = await fetch(`/api/repos/${repoId}/automation`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ automation_rules: updatedRules })
      });

      if (!response.ok) {
        throw new Error('Failed to update rules status');
      }

      // Update stats (which will fetch fresh data and update allRules state)
      updateStatsFromRules();

      addAlert({
        type: 'info',
        title: `All rules ${newEnabledState ? 'enabled' : 'disabled'}`,
        message: `All automation rules for this repository have been ${newEnabledState ? 'enabled' : 'disabled'}.`,
      });

    } catch (error: any) {
      console.error('Failed to toggle all rules enabled state:', error);
      setAutomationAlerts((prev) => ({
        ...prev,
        [repoId]: { type: 'error', message: error.message || 'Failed to update rules' }
      }));
    }
  }

  async function openAutomationModal(repoId: string) {
    setActiveAutomationRepoId(repoId);
    // Load existing rule or create new one
    await fetchAutomationRules(repoId);
  }

  function closeAutomationModal() {
    setActiveAutomationRepoId(null);
    setSingleRuleForm(null);
  }

  useEffect(() => {
    if (activeAutomationRepoId) {
      fetchAutomationRules(activeAutomationRepoId);
      if (connections.length === 0) loadConnections();
    }
  }, [activeAutomationRepoId]);

  // Load resources when a rule with a saved provider is loaded
  useEffect(() => {
    const provider = singleRuleForm?.auto_publish_target_provider;
    if (provider && isKnowledgeBaseProvider(provider)) {
      loadResourcesForProvider(provider);
    }
  }, [singleRuleForm?.auto_publish_target_provider]);

  const activeAutomationRepo = reposList.find((repo) => repo.id === activeAutomationRepoId) || null;
  const knowledgeBaseConnections = connections.filter((connection) => isKnowledgeBaseProvider(connection.provider));

  // Get resource options for single rule form
  const connectionId = singleRuleForm?.auto_publish_target_connection_id;
  const selectedConnection = connectionId ? connections.find((c) => c.connection_id === connectionId || c.id === connectionId) : null;
  const selectedProvider = selectedConnection?.provider || singleRuleForm?.auto_publish_target_provider;
  const normalizedSelectedProvider = normalizeProviderName(selectedProvider || '');
  const providerSupportsResources = Boolean(normalizedSelectedProvider && isKnowledgeBaseProvider(normalizedSelectedProvider));
  const providerResourceList = normalizedSelectedProvider ? providerResources[normalizedSelectedProvider] || [] : [];
  const resourceOptions = connectionId ? getResourcesForConnection(connectionId) : providerResourceList;
  const providerDisplayName = selectedProvider ? getProviderDisplayName(selectedProvider) : '';
  const resourceLoading = normalizedSelectedProvider ? providerResourceLoading[normalizedSelectedProvider] : false;
  const resourceError = normalizedSelectedProvider ? providerResourceErrors[normalizedSelectedProvider] : '';
  const helperText = !connectionId && !selectedProvider
    ? 'Resource list updates after you connect a provider.'
    : !providerSupportsResources
      ? 'Resource listing is only available for Notion, Confluence, and Coda connections.'
      : resourceLoading
        ? `Loading ${providerDisplayName || 'resources'}...`
        : resourceError
          ? resourceError
          : resourceOptions.length === 0
            ? `No resources found for ${providerDisplayName || 'this provider'} yet.`
            : `Choose a resource to publish to ${providerDisplayName || 'this provider'}.`;
  const defaultOptionLabel = resourceLoading ? `Loading ${providerDisplayName || 'resources'}...` : 'Select a resource';

  // Helper functions for UI
  const formatDate = (dateString: string) => {
    if (!dateString) return 'Never';
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const getStatusIcon = (status: string) => {
    if (status === 'success') return <span className="inline-block h-2 w-2 rounded-full bg-emerald-400"></span>;
    if (status === 'failed') return <span className="inline-block h-2 w-2 rounded-full bg-rose-400"></span>;
    if (status === 'skipped') return <span className="inline-block h-2 w-2 rounded-full bg-yellow-400"></span>;
    return <span className="inline-block h-2 w-2 rounded-full bg-white/40"></span>;
  };

  const getStatusColor = (status?: string) => {
    if (status === 'success') return 'bg-green-500/20 text-green-400';
    if (status === 'failed') return 'bg-red-500/20 text-red-400';
    if (status === 'skipped') return 'bg-yellow-500/20 text-yellow-400';
    return 'bg-white/10 text-white/60';
  };

  const getStatusIconComponent = (status?: string) => {
    if (status === 'success') return <CheckCircle2 className="h-4 w-4" />;
    if (status === 'failed') return <XCircle className="h-4 w-4" />;
    if (status === 'skipped') return <Clock className="h-4 w-4" />;
    return <Clock className="h-4 w-4" />;
  };

  // Enhanced status helpers for richer badges
  const getRichStatusBadge = (rule: any, showDetails = false) => {
    if (!rule) return null;

    const enabled = rule.enabled;
    const lastRunAt = rule.lastRunAt;
    const lastRunStatus = rule.lastRunStatus;
    const schedule = rule.schedule;

    // Calculate next run time if enabled and has schedule
    let nextRunInfo = '';
    if (enabled && schedule) {
      try {
        // Simple next run calculation based on cron
        const parts = schedule.split(/\s+/);
        if (parts.length >= 2) {
          const hour = parts[1];
          if (hour && hour !== '*') {
            const hourNum = parseInt(hour);
            if (!isNaN(hourNum)) {
              const now = new Date();
              const nextRun = new Date(now);
              nextRun.setHours(hourNum, 0, 0, 0);

              // If the time has passed today, schedule for tomorrow
              if (nextRun <= now) {
                nextRun.setDate(nextRun.getDate() + 1);
              }

              const timeUntil = nextRun.getTime() - now.getTime();
              const hoursUntil = Math.floor(timeUntil / (1000 * 60 * 60));
              if (hoursUntil < 24) {
                nextRunInfo = `next in ${hoursUntil}h`;
              }
            }
          }
        }
      } catch (error) {
        // Ignore cron parsing errors
      }
    }

    // Determine overall status
    let statusType: 'active' | 'paused' | 'failed' | 'skipped' | 'unknown' = 'unknown';
    let statusText = '';
    let statusEmoji = '⏸️';

    if (!enabled) {
      statusType = 'paused';
      statusText = 'Manually disabled';
      statusEmoji = '⏸️';
    } else if (lastRunStatus === 'failed') {
      statusType = 'failed';
      statusText = 'Recent failure';
      statusEmoji = '🔴';
    } else if (lastRunStatus === 'success') {
      statusType = 'active';
      statusText = nextRunInfo ? `Running every ${getCronDescription(schedule)}, ${nextRunInfo}` : 'Active';
      statusEmoji = '🟢';
    } else if (lastRunStatus === 'skipped') {
      statusType = 'skipped';
      statusText = 'No changes detected (normal)';
      statusEmoji = '⏸️';
    } else if (enabled) {
      statusType = 'active';
      statusText = nextRunInfo ? `Active, ${nextRunInfo}` : 'Active';
      statusEmoji = '🟢';
    }

    const statusColors = {
      active: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      paused: 'bg-gray-600/20 text-gray-400 border-gray-600/30',
      failed: 'bg-red-500/20 text-red-300 border-red-500/30',
      skipped: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      unknown: 'bg-white/10 text-white/60 border-white/20'
    };

    if (showDetails) {
      return (
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium ${statusColors[statusType]}`}>
          <span className="text-base">{statusEmoji}</span>
          <div className="flex flex-col">
            <span className="font-semibold">{statusText}</span>
            {lastRunAt && (
              <span className="text-xs opacity-80">
                Last: {formatDate(lastRunAt)}
                {lastRunStatus && ` (${lastRunStatus})`}
              </span>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-medium ${statusColors[statusType]}`}>
        <span>{statusEmoji}</span>
        <span>{statusText}</span>
      </div>
    );
  };

  const getExecutionTimeline = (rule: any) => {
    if (!rule.lastRunAt) return null;

    const lastRun = new Date(rule.lastRunAt);
    const now = new Date();
    const daysSince = Math.floor((now.getTime() - lastRun.getTime()) / (1000 * 60 * 60 * 24));

    let timelineText = '';
    let timelineColor = 'text-white/40';

    if (daysSince === 0) {
      timelineText = 'Today';
      timelineColor = 'text-emerald-400';
    } else if (daysSince === 1) {
      timelineText = 'Yesterday';
      timelineColor = 'text-blue-400';
    } else if (daysSince < 7) {
      timelineText = `${daysSince} days ago`;
      timelineColor = 'text-yellow-400';
    } else {
      timelineText = lastRun.toLocaleDateString();
      timelineColor = 'text-white/40';
    }

    return (
      <div className={`text-xs ${timelineColor} flex items-center gap-1`}>
        <Clock className="h-3 w-3" />
        {timelineText}
      </div>
    );
  };


  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Zap className="h-8 w-8 text-purple-400" />
          <h1 className="text-3xl font-bold text-white">Automation</h1>
        </div>
        <p className="text-white/70">
          Set it and forget it. Automatically generate and publish documentation when your code changes.
        </p>
      </div>

      {/* Smart Alerts */}
      {alerts.length > 0 && (
        <div className="mb-6 space-y-3">
          {alerts.slice(0, 3).map((alert) => (
            <div
              key={alert.id}
              className={`relative p-4 rounded-lg border backdrop-blur-sm transition-all duration-200 ${alert.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-100'
                  : alert.type === 'error'
                    ? 'bg-red-500/10 border-red-500/20 text-red-100'
                    : alert.type === 'warning'
                      ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-100'
                      : 'bg-blue-500/10 border-blue-500/20 text-blue-100'
                }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`p-1 rounded ${alert.type === 'success' ? 'bg-emerald-500/20' :
                        alert.type === 'error' ? 'bg-red-500/20' :
                          alert.type === 'warning' ? 'bg-yellow-500/20' :
                            'bg-blue-500/20'
                      }`}>
                      {alert.type === 'success' && <CheckCircle2 className="h-4 w-4" />}
                      {alert.type === 'error' && <XCircle className="h-4 w-4" />}
                      {alert.type === 'warning' && <AlertTriangle className="h-4 w-4" />}
                      {alert.type === 'info' && <Zap className="h-4 w-4" />}
                    </div>
                    <h4 className="font-semibold text-sm">{alert.title}</h4>
                  </div>
                  <p className="text-sm opacity-90 mb-2">{alert.message}</p>

                  {alert.details && alert.expanded && (
                    <div className="mt-2 p-3 rounded bg-black/20 text-xs opacity-80">
                      {alert.details}
                    </div>
                  )}

                  <div className="flex items-center gap-3 mt-2">
                    {alert.details && (
                      <button
                        onClick={() => toggleAlertExpansion(alert.id)}
                        className="text-xs opacity-70 hover:opacity-100 transition-opacity"
                      >
                        {alert.expanded ? 'Show less' : 'Show details'}
                      </button>
                    )}
                    {alert.actions?.map((action, index) => (
                      <button
                        key={index}
                        onClick={action.action}
                        className={`text-xs px-2 py-1 rounded transition-colors ${action.variant === 'primary'
                            ? 'bg-white/20 hover:bg-white/30 text-white'
                            : 'opacity-70 hover:opacity-100'
                          }`}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => dismissAlert(alert.id)}
                  className="ml-2 opacity-50 hover:opacity-100 transition-opacity"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}

          {alerts.length > 3 && (
            <div className="flex justify-center">
              <button
                onClick={clearAllAlerts}
                className="text-xs text-white/60 hover:text-white/80 transition-colors"
              >
                Clear all notifications ({alerts.length})
              </button>
            </div>
          )}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="glass-panel p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-white/60">Total Rules</p>
            <Zap className="h-5 w-5 text-purple-400" />
          </div>
          <p className="text-3xl font-semibold text-white">{stats.totalRules}</p>
          <p className="text-xs text-white/50 mt-1">across {reposList.length} repositories</p>
        </div>

        <div className="glass-panel p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-white/60">Active Rules</p>
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          </div>
          <p className="text-3xl font-semibold text-white">{stats.activeRules}</p>
          <p className="text-xs text-white/50 mt-1">currently enabled</p>
        </div>

        <div className="glass-panel p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-white/60">Last 24h</p>
            <TrendingUp className="h-5 w-5 text-blue-400" />
          </div>
          <p className="text-3xl font-semibold text-white">{stats.executions24h}</p>
          <p className="text-xs text-white/50 mt-1">executions</p>
        </div>

        <div className="glass-panel p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-white/60">Success Rate</p>
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          </div>
          <p className="text-3xl font-semibold text-white">{stats.successRate}%</p>
          <p className="text-xs text-white/50 mt-1">last 24 hours</p>
        </div>
      </div>



      {/* Combined Content */}
      {/* Repository Management Section */}
      <div className="glass-panel p-6 mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-white mb-2">Repositories & Automation Rules</h2>
            <p className="text-white/70">Manage your repositories and configure automation rules</p>
          </div>
        </div>


        {/* Repositories List */}
        {loadingRepos ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-white/50 mx-auto mb-2" />
            <p className="text-white/60">Loading repositories...</p>
          </div>
        ) : reposList.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
            <Github className="h-12 w-12 text-white/30 mx-auto mb-4" />
            <p className="text-white/60 mb-2">No repositories registered yet.</p>
            <p className="text-white/50 text-sm">Connect repositories through the repository setup process to enable automation.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-white/10 bg-white/5">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white/90 w-8"></th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white/90">Repository</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white/90">Branch</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white/90">Automation</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white/90">Added</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-white/90">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {reposList.map((repo) => {
                  const repoInfo = parseRepoUrl(repo.repo_url);
                  const repoRules = allRules.filter((r) => r.repoId === repo.id);
                  const hasRules = repoRules.length > 0;
                  const activeRules = repoRules.filter((r) => r.enabled).length;
                  const isExpanded = expandedRows.has(repo.id);

                  return (
                    <React.Fragment key={repo.id}>
                      {/* Main Repository Row */}
                      <tr className="hover:bg-white/5 transition-colors cursor-pointer" onClick={() => toggleExpandedRow(repo.id)}>
                        <td className="px-4 py-3 w-8">
                          <ChevronDown
                            className={`h-4 w-4 text-white/60 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Github className="h-4 w-4 text-white/60" />
                            <div>
                              <div className="font-semibold text-white">{repo.name}</div>
                              <div className="text-xs text-white/50 font-mono">
                                {repo.repo_url}
                              </div>
                              {repo.settings?.subdir && (
                                <div className="text-xs text-white/40 mt-0.5">
                                  Path: {repo.settings.subdir}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 text-sm text-white/70">
                            <GitBranch className="h-3 w-3" />
                            {repo.default_branch}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {hasRules ? (
                            <div className="space-y-1">
                              {getRichStatusBadge(repoRules[0])}
                              {getExecutionTimeline(repoRules[0])}
                            </div>
                          ) : (
                            <span className="text-xs text-white/40">No rules</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-white/70">
                          {new Date(repo.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {hasRules && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleAllRulesEnabled(repo.id);
                                  }}
                                  className={`relative inline-flex h-6 w-10 items-center rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${activeRules > 0
                                    ? 'bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/30'
                                    : 'bg-gray-600 hover:bg-gray-500'
                                    }`}
                                  title={activeRules > 0 ? 'Disable all rules' : 'Enable all rules'}
                                >
                                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${activeRules > 0 ? 'translate-x-5' : 'translate-x-1'
                                    }`} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // Delete all rules for this repo
                                    const rule = repoRules[0]; // Since there's only one rule per repo
                                    if (rule) {
                                      setDeleteRuleModal({ open: true, repoId: repo.id, ruleId: rule.ruleId, ruleName: rule.ruleName });
                                    }
                                  }}
                                  className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/20 px-2 py-1 rounded transition-all duration-200"
                                  title="Delete automation rule"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openAutomationModal(repo.id);
                              }}
                              className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white/80 transition-all duration-200 hover:bg-white/20 hover:border-white/30 hover:shadow-lg hover:shadow-blue-500/20"
                              title="Configure automation rules"
                            >
                              <Zap className="h-3 w-3" />
                              {hasRules ? 'Manage' : 'Setup'}
                            </button>
                            {repoInfo && (
                              <a
                                href={repo.repo_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white/90 transition-all duration-200 hover:bg-white/20 hover:border-white/30 hover:shadow-lg hover:shadow-purple-500/20"
                                title="Open repository on GitHub"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Automation Rules Row */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="px-0 py-0">
                            <div className="border-t border-white/10 bg-white/5">
                              <div className="p-6">
                                <div className="flex items-center justify-between mb-4">
                                  <div className="flex items-center gap-3">
                                    <Github className="h-5 w-5 text-white/60" />
                                    <div>
                                      <h3 className="text-lg font-semibold text-white">{repo.name}</h3>
                                      <p className="text-sm text-white/60">{repo.repo_url}</p>
                                      <p className="text-xs text-white/50 flex items-center gap-1 mt-0.5">
                                        <GitBranch className="h-3 w-3" />
                                        {repo.default_branch}
                                      </p>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => openAutomationModal(repo.id)}
                                    className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-white/20 hover:border-white/30 hover:shadow-lg hover:shadow-blue-500/20"
                                  >
                                    <Plus className="h-4 w-4" />
                                    Add Rule
                                  </button>
                                </div>

                                {/* Automation Rules Content */}
                                {repoRules.length > 0 ? (
                                  <div className="space-y-4">
                                    {repoRules.map((rule) => (
                                      <div key={rule.ruleId} className="rounded-lg border border-white/10 bg-black/40 p-4">
                                        <div className="flex items-start justify-between gap-3 mb-3">
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                              <h4 className="font-semibold text-white">{rule.ruleName}</h4>
                                              {getRichStatusBadge(rule, true)}
                                            </div>
                                            <p className="text-sm text-white/70 mb-2">
                                              {rule.action_preset === 'docs_only' && '📄 Generates documentation only'}
                                              {rule.action_preset === 'diagrams_only' && '🎨 Generates diagrams only'}
                                              {rule.action_preset === 'docs_and_diagrams' && '📊 Generates both docs and diagrams'}
                                              {rule.action_preset === 'full_auto_publish' && '🚀 Auto-generates and publishes'}
                                            </p>
                                            <div className="flex items-center gap-4 text-xs text-white/60">
                                              <span>Schedule: {getCronDescription(rule.schedule || '')}</span>
                                              {rule.lastRunAt && (
                                                <span>Last: {formatDate(rule.lastRunAt)}</span>
                                              )}
                                            </div>
                                          </div>
                                          <div className="flex flex-col items-end gap-2">
                                            <div className={`rounded-full p-2 ${getStatusColor(rule.lastRunStatus)}`}>
                                              {getStatusIconComponent(rule.lastRunStatus)}
                                            </div>
                                            {rule.lastRunStatus === 'failed' && (
                                              <div className="flex items-center gap-1 text-xs text-red-400">
                                                <AlertTriangle className="h-3 w-3" />
                                                Failed
                                              </div>
                                            )}
                                          </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                          <button
                                            onClick={() => toggleRuleEnabled(repo.id, rule.ruleId)}
                                            className={`relative inline-flex h-6 w-10 items-center rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${rule.enabled
                                              ? 'bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/30'
                                              : 'bg-gray-600 hover:bg-gray-500'
                                              }`}
                                            title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                                          >
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${rule.enabled ? 'translate-x-5' : 'translate-x-1'
                                              }`} />
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setDeleteRuleModal({ open: true, repoId: repo.id, ruleId: rule.ruleId, ruleName: rule.ruleName });
                                            }}
                                            className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/20 px-2 py-1 rounded transition-all duration-200"
                                            title="Delete rule"
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </button>
                                          <p className="flex-1 text-xs text-white/50 text-right">Click to configure →</p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div
                                    onClick={() => openAutomationModal(repo.id)}
                                    className="rounded-lg border-2 border-dashed border-white/20 bg-white/5 p-8 text-center cursor-pointer hover:bg-white/10 transition-colors"
                                  >
                                    <Plus className="h-8 w-8 text-white/40 mx-auto mb-2" />
                                    <p className="text-sm text-white/60 mb-1">No automation rule configured</p>
                                    <p className="text-xs text-white/40">Click to add a rule</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>




      {/* Execution Dashboard Modal */}
      {executionDashboard?.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => !executionDashboard.completed && setExecutionDashboard(null)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !executionDashboard.completed) setExecutionDashboard(null);
          }}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-white/20 bg-black/95 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/20">
                    <Zap className="h-6 w-6 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">Automation Execution</h2>
                    <p className="text-sm text-white/60">{executionDashboard.repoName}</p>
                  </div>
                </div>
                {!executionDashboard.completed && (
                  <button
                    onClick={() => setExecutionDashboard(null)}
                    className="text-white/60 hover:text-white transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>

              <div className="space-y-6">
                {/* Rule Info */}
                <div className="flex items-center justify-between p-4 rounded-lg border border-white/10 bg-white/5">
                  <div>
                    <p className="font-medium text-white">{executionDashboard.ruleName}</p>
                    <p className="text-sm text-white/60">Running automation rule</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-white/60">Started</p>
                    <p className="text-sm text-white">
                      {new Date(executionDashboard.progress.startTime).toLocaleTimeString()}
                    </p>
                  </div>
                </div>

                {/* Progress Indicators */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-white">Execution Progress</h3>
                    <span className="text-sm text-white/60">
                      {executionDashboard.progress.progress}% complete
                    </span>
                  </div>

                  {/* Overall Progress */}
                  <div className="w-full bg-white/10 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${executionDashboard.progress.progress}%` }}
                    />
                  </div>

                  {/* Current Phase */}
                  <div className="flex items-center gap-3 p-4 rounded-lg border border-white/10 bg-white/5">
                    <div className="flex-shrink-0">
                      {executionDashboard.progress.phase === 'detecting' && <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />}
                      {executionDashboard.progress.phase === 'processing' && <TrendingUp className="h-5 w-5 text-yellow-400" />}
                      {executionDashboard.progress.phase === 'updating' && <CheckCircle2 className="h-5 w-5 text-green-400" />}
                      {executionDashboard.progress.phase === 'publishing' && <ExternalLink className="h-5 w-5 text-purple-400" />}
                      {executionDashboard.completed && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-white">{executionDashboard.progress.status}</p>
                      {executionDashboard.progress.details && (
                        <p className="text-sm text-white/60">{executionDashboard.progress.details}</p>
                      )}
                    </div>
                  </div>

                  {/* Phase Progress Bars */}
                  <div className="grid grid-cols-1 gap-3">
                    {[
                      { phase: 'detecting', label: '🔍 Detecting Changes', color: 'from-blue-500 to-blue-600' },
                      { phase: 'processing', label: '📝 Processing Files', color: 'from-yellow-500 to-yellow-600' },
                      { phase: 'updating', label: '📄 Updating Documents', color: 'from-green-500 to-green-600' },
                      { phase: 'publishing', label: '🚀 Publishing Content', color: 'from-purple-500 to-purple-600' },
                    ].map((phaseInfo, index) => {
                      const isActive = executionDashboard.progress.phase === phaseInfo.phase;
                      const isCompleted = executionDashboard.completed ||
                        ['processing', 'updating', 'publishing'].includes(executionDashboard.progress.phase) && index < ['detecting', 'processing', 'updating', 'publishing'].indexOf(executionDashboard.progress.phase);

                      let progress = 0;
                      if (isCompleted) progress = 100;
                      else if (isActive) progress = executionDashboard.progress.progress;
                      else progress = 0;

                      return (
                        <div key={phaseInfo.phase} className="flex items-center gap-3">
                          <div className="w-32 text-xs text-white/60">{phaseInfo.label}</div>
                          <div className="flex-1">
                            <div className="w-full bg-white/10 rounded-full h-1.5">
                              <div
                                className={`bg-gradient-to-r ${phaseInfo.color} h-1.5 rounded-full transition-all duration-500 ease-out ${isActive ? 'animate-pulse' : ''
                                  }`}
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                          <div className="w-12 text-right text-xs text-white/60">
                            {progress}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Completion Results */}
                {executionDashboard.completed && executionDashboard.result && (
                  <div className="p-4 rounded-lg border border-white/10 bg-white/5">
                    <h4 className="font-semibold text-white mb-2">Execution Complete</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-white/60">Status:</span>
                        <span className={executionDashboard.result.success ? 'text-emerald-400' : 'text-red-400'}>
                          {executionDashboard.result.success ? 'Success' : 'Failed'}
                        </span>
                      </div>
                      {executionDashboard.result.stats && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-white/60">Files Processed:</span>
                            <span className="text-white">{executionDashboard.result.stats.filesProcessed || 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/60">Documents Updated:</span>
                            <span className="text-white">{executionDashboard.result.stats.documentsUpdated || 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/60">Time Elapsed:</span>
                            <span className="text-white">{executionDashboard.result.stats.timeElapsed || 0}s</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex justify-end gap-3">
                  {executionDashboard.completed ? (
                    <>
                      <button
                        onClick={() => setExecutionDashboard(null)}
                        className="px-4 py-2 text-white/80 hover:text-white transition-colors"
                      >
                        Close
                      </button>
                      <button
                        onClick={() => {
                          setExecutionDashboard(null);
                          // Refresh data
                          loadRepos();
                        }}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                      >
                        View Results
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleCancelRule(executionDashboard.repoId, executionDashboard.ruleId)}
                      className="px-4 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-colors"
                    >
                      Cancel Execution
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Rule Confirmation Modal */}
      {deleteRuleModal.open && deleteRuleModal.repoId && deleteRuleModal.ruleId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => !deleting && setDeleteRuleModal({ open: false, repoId: null, ruleId: null, ruleName: '' })}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !deleting) setDeleteRuleModal({ open: false, repoId: null, ruleId: null, ruleName: '' });
          }}
        >
          <div
            className="w-full max-w-md rounded-xl border border-white/20 bg-black/90 p-6 shadow-xl backdrop-blur-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-xl font-semibold text-white">Delete Automation Rule</h2>
            <p className="mb-6 text-white/70">
              Are you sure you want to delete the rule <span className="font-semibold text-white">{deleteRuleModal.ruleName}</span>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                className="rounded-lg border border-white/20 px-4 py-2 text-white/80 hover:bg-white/10 disabled:opacity-50"
                onClick={() => setDeleteRuleModal({ open: false, repoId: null, ruleId: null, ruleName: '' })}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                onClick={() => deleteRuleModal.repoId && deleteRuleModal.ruleId && handleDeleteRule(deleteRuleModal.repoId, deleteRuleModal.ruleId)}
                disabled={deleting}
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 inline animate-spin mr-2" />
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Automation Configuration Modal */}
      {activeAutomationRepo && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={closeAutomationModal}
          onKeyDown={(e) => {
            if (e.key === 'Escape') closeAutomationModal();
          }}
        >
          <div
            className="w-full max-w-4xl rounded-2xl border border-white/20 bg-black/95 shadow-xl"
            style={{ maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-full flex-col">
              <div className="space-y-6 px-6 py-6 text-white">
                <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-white">Automation rules</h3>
                    <p className="text-sm text-white/70">
                      Schedule documentation updates for {activeAutomationRepo.name} with clear triggers and publishing behavior.
                    </p>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs uppercase tracking-wider text-white/60">Repository</span>
                    <p className="font-semibold text-white">{activeAutomationRepo.name}</p>
                  </div>
                  <button
                    onClick={closeAutomationModal}
                    className="ml-auto rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white/80 transition hover:bg-white/10"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="relative flex-1 overflow-hidden border-t border-white/5">
                {automationLoading[activeAutomationRepo.id] ? (
                  <div className="flex h-full items-center justify-center px-6 py-12 text-sm text-white/60">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Loading automation rule...
                  </div>
                ) : singleRuleForm ? (
                  <div className="space-y-6 overflow-y-auto px-6 py-6" style={{ maxHeight: 'calc(90vh - 140px)' }}>
                    <div className="space-y-5 rounded-2xl border border-white/10 bg-black/40 p-5">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-white">Configure Automation Rule</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateSingleRuleField('enabled', !singleRuleForm.enabled)}
                            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition ${singleRuleForm.enabled
                              ? 'border-emerald-500 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                              : 'border-white/30 text-white/60 hover:border-white/50 hover:text-white'
                              }`}
                          >
                            {singleRuleForm.enabled ? 'Enabled' : 'Disabled'}
                          </button>
                          <p className="text-xs text-white/60">When off, the rule is ignored. Rules are automatically enabled when saved.</p>
                        </div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="text-sm text-white/80">
                          Rule label
                          <input
                            type="text"
                            value={singleRuleForm.name}
                            onChange={(event) => updateSingleRuleField('name', event.target.value)}
                            className="mt-1 w-full rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                            placeholder="e.g., Nightly documentation"
                          />
                        </label>
                        <div>
                          <label className="text-sm text-white/80">
                            Schedule (Cron Expression)
                          </label>

                          {/* Cron Expression Input */}
                          <input
                            type="text"
                            value={singleRuleForm.customCron}
                            onChange={(event) => updateSingleRuleField('customCron', event.target.value)}
                            placeholder="0 2 * * * (daily at 2 AM UTC)"
                            className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm text-white outline-none focus:border-blue-500 font-mono ${singleRuleForm.customCron && !isValidCron(singleRuleForm.customCron)
                              ? 'border-red-500/50 bg-red-900/20'
                              : 'border-white/20 bg-black/60'
                              }`}
                          />

                          {/* Quick Preset Buttons */}
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => updateSingleRuleField('customCron', '0 2 * * *')}
                              className="px-2 py-1 text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 rounded border border-blue-600/30 transition-colors"
                            >
                              Daily 2 AM
                            </button>
                            <button
                              type="button"
                              onClick={() => updateSingleRuleField('customCron', '0 9 * * *')}
                              className="px-2 py-1 text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 rounded border border-blue-600/30 transition-colors"
                            >
                              Daily 9 AM
                            </button>
                            <button
                              type="button"
                              onClick={() => updateSingleRuleField('customCron', '0 */6 * * *')}
                              className="px-2 py-1 text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 rounded border border-blue-600/30 transition-colors"
                            >
                              Every 6 hours
                            </button>
                            <button
                              type="button"
                              onClick={() => updateSingleRuleField('customCron', '*/30 * * * *')}
                              className="px-2 py-1 text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 rounded border border-blue-600/30 transition-colors"
                            >
                              Every 30 min
                            </button>
                            <button
                              type="button"
                              onClick={() => updateSingleRuleField('customCron', '0 9 * * 1')}
                              className="px-2 py-1 text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 rounded border border-blue-600/30 transition-colors"
                            >
                              Weekly Monday 9 AM
                            </button>
                            <button
                              type="button"
                              onClick={() => updateSingleRuleField('customCron', '0 0 * * 1')}
                              className="px-2 py-1 text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 rounded border border-blue-600/30 transition-colors"
                            >
                              Weekly Monday
                            </button>
                          </div>

                          {/* Help Text */}
                          <div className="mt-2 space-y-1">
                            <p className="text-xs text-white/50">
                              Format: <code className="bg-black/40 px-1 rounded font-mono">minute hour day month weekday</code>
                            </p>
                            <div className="text-xs text-white/40 space-y-1">
                              <div>• <code className="bg-black/40 px-1 rounded font-mono">*</code> = any value</div>
                              <div>• <code className="bg-black/40 px-1 rounded font-mono">*/5</code> = every 5 units</div>
                              <div>• <code className="bg-black/40 px-1 rounded font-mono">1,3,5</code> = specific values</div>
                              <div>• <code className="bg-black/40 px-1 rounded font-mono">1-5</code> = range</div>
                            </div>
                          </div>

                          {/* Validation and Description */}
                          {singleRuleForm.customCron && (
                            <div className={`mt-2 p-2 rounded border ${isValidCron(singleRuleForm.customCron)
                              ? 'bg-black/20 border-white/10'
                              : 'bg-red-900/20 border-red-500/30'
                              }`}>
                              <p className={`text-xs ${isValidCron(singleRuleForm.customCron)
                                ? 'text-white/70'
                                : 'text-red-300'
                                }`}>
                                <span className="font-medium">
                                  {isValidCron(singleRuleForm.customCron) ? 'Current:' : 'Error:'}
                                </span>{' '}
                                {isValidCron(singleRuleForm.customCron)
                                  ? getCronDescription(singleRuleForm.customCron)
                                  : 'Invalid cron expression format'}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action Presets - Simplified UI */}
                      <div className="space-y-4">
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <label className="block text-sm font-medium text-white/90">
                              What should this automation do?
                            </label>
                            {singleRuleForm.action_preset && (
                              <div className="text-xs text-green-400 font-medium flex items-center gap-1">
                                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                                Active: {
                                  singleRuleForm.action_preset === 'docs_only' ? '📄 Docs Only' :
                                    singleRuleForm.action_preset === 'diagrams_only' ? '🎨 Diagrams Only' :
                                      singleRuleForm.action_preset === 'docs_and_diagrams' ? '📊 Everything' :
                                        singleRuleForm.action_preset === 'full_auto_publish' ? '🚀 Auto-Publish' :
                                          'Not selected'
                                }
                              </div>
                            )}
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            {[
                              {
                                value: 'docs_only',
                                label: '📄 Update Documentation Only',
                                description: 'Regenerate documentation when files change significantly'
                              },
                              {
                                value: 'diagrams_only',
                                label: '🎨 Update Diagrams Only',
                                description: 'Generate architecture diagrams when changes are detected'
                              },
                              {
                                value: 'docs_and_diagrams',
                                label: '📊 Update Everything',
                                description: 'Regenerate both documentation and diagrams'
                              },
                              {
                                value: 'full_auto_publish',
                                label: '🚀 Full Auto-Publish',
                                description: 'Update content and publish to configured knowledge bases'
                              }
                            ].map((preset) => {
                              const isSelected = singleRuleForm.action_preset === preset.value;
                              return (
                                <button
                                  key={preset.value}
                                  type="button"
                                  onClick={() => updateSingleRuleField('action_preset', preset.value)}
                                  className={`relative p-4 rounded-lg border-2 text-left transition-all ${isSelected
                                    ? 'border-green-500 bg-green-500/15 text-green-100 shadow-lg shadow-green-500/20'
                                    : 'border-white/20 bg-white/5 hover:bg-white/10 hover:border-white/30 text-white/80'
                                    }`}
                                >
                                  {isSelected && (
                                    <div className="absolute top-2 right-2">
                                      <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                      </div>
                                    </div>
                                  )}
                                  <div className={`font-semibold text-sm mb-1 ${isSelected ? 'text-green-100' : ''}`}>
                                    {preset.label}
                                  </div>
                                  <div className={`text-xs ${isSelected ? 'text-green-200/80' : 'text-white/60'}`}>
                                    {preset.description}
                                  </div>
                                  {isSelected && (
                                    <div className="mt-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-200">
                                      Selected
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Smart Analysis Settings */}
                        <div className="rounded-lg border border-white/20 bg-white/5 p-4">
                          <h4 className="text-sm font-semibold text-white/90 mb-3">🎯 Smart Analysis</h4>
                          <p className="text-xs text-white/60 mb-3">
                            Automation only runs when changes are significant enough to warrant documentation updates.
                          </p>
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-medium text-white/70 mb-1">Change Sensitivity</label>
                              <select
                                value={singleRuleForm.significance_sensitivity}
                                onChange={(e) => updateSingleRuleField('significance_sensitivity', e.target.value)}
                                className="w-full rounded border border-white/20 bg-white/10 px-3 py-2 text-sm text-white"
                              >
                                <option value="strict">Strict - Only major changes</option>
                                <option value="balanced">Balanced - Recommended</option>
                                <option value="lenient">Lenient - Catch more changes</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* Notifications */}
                        <div className="rounded-lg border border-white/20 bg-white/5 p-4">
                          <h4 className="text-sm font-semibold text-white/90 mb-3">📧 Notifications</h4>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={singleRuleForm.notifications_email_enabled}
                              onChange={(e) => updateSingleRuleField('notifications_email_enabled', (e.target as HTMLInputElement).checked)}
                              className="h-4 w-4 rounded border-white/30 bg-black/60 text-blue-500"
                            />
                            Send email notifications when automation completes
                          </label>
                        </div>
                      </div>


                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="text-sm text-white/80">
                          Target provider
                          <select
                            value={
                              singleRuleForm.auto_publish_target_connection_id ||
                              (singleRuleForm.auto_publish_target_provider ? `provider:${singleRuleForm.auto_publish_target_provider}` : '')
                            }
                            onChange={(event) => {
                              const selectedValue = event.target.value;
                              if (!selectedValue) {
                                setRuleConnection('', '');
                                return;
                              }
                              if (selectedValue.startsWith('provider:')) {
                                const provider = selectedValue.replace('provider:', '');
                                setRuleConnection('', provider);
                                return;
                              }
                              const selectedConn = connections.find(
                                (c) => c.connection_id === selectedValue || c.id === selectedValue
                              );
                              setRuleConnection(selectedValue, selectedConn?.provider ?? '');
                            }}
                            className="mt-1 w-full rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                          >
                            <option value="">Select a knowledge base provider or connection</option>
                            <optgroup label="Connected providers">
                              {knowledgeBaseConnections.map((connection) => (
                                <option key={connection.connection_id} value={connection.connection_id}>
                                  {getProviderDisplayName(connection.provider)}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        </label>
                        <label className="text-sm text-white/80">
                          Target resource
                          <select
                            value={singleRuleForm.auto_publish_target_resource_id || ''}
                            onChange={(event) => updateSingleRuleField('auto_publish_target_resource_id', event.target.value)}
                            className="mt-1 w-full rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                          >
                            <option value="">{defaultOptionLabel}</option>
                            {/* Show saved resource_id as option if not in list */}
                            {singleRuleForm.auto_publish_target_resource_id &&
                              !resourceOptions.some(r => r.id === singleRuleForm.auto_publish_target_resource_id) && (
                                <option value={singleRuleForm.auto_publish_target_resource_id}>
                                  {singleRuleForm.auto_publish_target_resource_id} (saved)
                                </option>
                              )}
                            {resourceOptions.map((resource) => (
                              <option key={resource.id} value={resource.id}>
                                {resource.name}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-white/50 mt-1">{helperText}</p>
                        </label>
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => activeAutomationRepoId && handleSaveAutomationRules(activeAutomationRepoId)}
                          disabled={Boolean(activeAutomationRepoId && automationSaving[activeAutomationRepoId])}
                          className="inline-flex items-center gap-2 rounded-lg border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {activeAutomationRepoId && automationSaving[activeAutomationRepoId] ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            'Save Rule'
                          )}
                        </button>
                      </div>
                    </div>

                    {activeAutomationRepoId && automationAlerts[activeAutomationRepoId] && (
                      <p
                        className={`mt-2 text-sm ${automationAlerts[activeAutomationRepoId]?.type === 'error' ? 'text-red-300' : 'text-emerald-300'
                          }`}
                      >
                        {automationAlerts[activeAutomationRepoId]?.message}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center px-6 py-12 text-sm text-white/60">
                    <p>No rule form available</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
