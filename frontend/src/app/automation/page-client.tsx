'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Zap, Plus, CheckCircle2, Loader2, GitBranch, ExternalLink, TrendingUp, ChevronDown, Github, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { getIntegrationsCached } from '@/lib/client/integrationsCache';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';

// Import all the automation types and interfaces from settings
interface Connection {
  id: string;
  provider: string;
  connection_id: string;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface Repo {
  id: string;
  name: string;
  provider: string;
  repo_url?: string;
  external_url?: string;
  default_branch: string;
  auth_type: string;
  credentials_ref?: string;
  settings?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// Removed unused interface: AutomationRulesResponse

interface AutomationRuleForm {
  id: string;
  name: string;
  enabled: boolean;
  customCron: string;
  customScheduleDescription?: string;

  // Individual behavior toggles (replaces action_preset)
  generate_doc: boolean;
  generate_diagram: boolean;
  auto_publish: boolean;
  auto_approve: boolean;
  run_diff?: boolean;

  // NEW: Scope targeting
  target_diagrams: string[];  // Empty = all diagrams of selected types

  // NEW: Auto-publish configuration
  auto_publish_target_provider?: string;
  auto_publish_target_connection_id?: string;
  auto_publish_target_resource_id?: string;
  auto_publish_custom_resource?: string;
  jira_project_key?: string;
  diff_github_repo_id?: string;
  diff_window_minutes?: string;

  // LEGACY: Keep for backward compatibility
  detect_changes?: boolean;
}

type AutomationAlert = {
  type: 'success' | 'error';
  message: string;
} | null;

type AutomationPreset = 'docs_only' | 'diagrams_only' | 'docs_and_diagrams' | 'full_auto_publish';
type StatsRange = 'all' | '24h' | '7d' | '30d';

interface AutomationPageClientProps {
  user: SupabaseUser | null;
  repos: Repo[];
  connections: Connection[];
  allRules: Array<{
    sourceId: string;
    sourceName: string;
    sourceUrl: string;
    ruleId: string;
    ruleName: string;
    enabled: boolean;
    generate_doc?: boolean;
    generate_diagram?: boolean;
    auto_publish?: boolean;
    auto_approve?: boolean;
    schedule?: string;
    lastRunAt?: string;
    lastRunStatus?: string;
    lastExecution?: Record<string, unknown>;
  }>;
  stats: {
    totalRules: number;
    activeRules: number;
    executions: number;
    successRate: number;
  };
}

const KNOWLEDGE_BASE_PROVIDERS = new Set<string>(['notion', 'confluence', 'coda']);
const STATS_RANGE_OPTIONS: Array<{ value: StatsRange; label: string; description: string }> = [
  { value: 'all', label: 'All time', description: 'all time' },
  { value: '24h', label: '24h', description: 'last 24 hours' },
  { value: '7d', label: '7d', description: 'last 7 days' },
  { value: '30d', label: '30d', description: 'last 30 days' },
];

function presetFromFlags(flags: { generate_doc?: boolean; generate_diagram?: boolean; auto_publish?: boolean }): AutomationPreset {
  const generateDoc = Boolean(flags.generate_doc);
  const generateDiagram = Boolean(flags.generate_diagram);
  const autoPublish = Boolean(flags.auto_publish);

  if (autoPublish) return 'full_auto_publish';
  if (generateDoc && generateDiagram) return 'docs_and_diagrams';
  if (!generateDoc && generateDiagram) return 'diagrams_only';
  return 'docs_only';
}

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
  } catch {
    return false;
  }
}

function getCronDescription(cron: string): string {
  try {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return 'Invalid cron expression';

    const [minute, hour] = parts;

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
  } catch {
    return 'Invalid cron expression';
  }
}

// NEW: Enhanced status calculation functions
// Helper function for date formatting (moved up for getEnhancedStatus function)
function formatDate(dateString: string): string {
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
}

function calculateNextRun(cronExpression: string): string {
  try {
    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length !== 5) return 'Unknown';

    const [minute, hour] = parts;
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();

    if (hour === '*' || hour.startsWith('*/')) {
      // Hourly schedule
      if (minute === '0') {
        // Every hour at :00
        if (currentMinute === 0) return 'Now';
        return `in ${60 - currentMinute}m`;
      } else if (minute.startsWith('*/')) {
        // Every X minutes
        const interval = parseInt(minute.slice(2));
        const nextMinute = Math.ceil((currentMinute + 1) / interval) * interval;
        const minutesUntil = nextMinute - currentMinute;
        return minutesUntil === 0 ? 'Now' : `in ${minutesUntil}m`;
      }
    } else if (hour.includes(',')) {
      // Multiple hours
      const hours = hour.split(',').map(h => parseInt(h)).sort((a, b) => a - b);
      const nextHour = hours.find(h => h > currentHour) || hours[0] + 24;
      const hourDiff = nextHour - currentHour;
      if (hourDiff === 0) {
        const nextMin = parseInt(minute) || 0;
        if (currentMinute < nextMin) return `in ${nextMin - currentMinute}m`;
        return `in ${60 - currentMinute + nextMin}m`;
      }
      return `in ${hourDiff}h`;
    } else {
      // Specific hour
      const targetHour = parseInt(hour);
      let hourDiff = targetHour - currentHour;
      if (hourDiff <= 0) hourDiff += 24;

      if (hourDiff === 0) {
        const targetMinute = parseInt(minute) || 0;
        const minuteDiff = targetMinute - currentMinute;
        if (minuteDiff <= 0) return `in ${24 * 60 + minuteDiff}m`;
        return `in ${minuteDiff}m`;
      }
      return `in ${hourDiff}h`;
    }

    return 'Soon';
  } catch {
    return 'Unknown';
  }
}

function getEnhancedStatus(rule: {
  enabled?: boolean;
  last_run_status?: string;
  last_run_at?: string;
  schedule?: string;
}): {
  status: 'active' | 'paused' | 'failed' | 'skipped' | 'unknown';
  icon: string;
  title: string;
  description: string;
  color: string;
} {
  const enabled = rule.enabled;
  const lastStatus = rule.last_run_status;
  const lastRunAt = rule.last_run_at;
  const schedule = rule.schedule;

  // If disabled, show paused status
  if (!enabled) {
    return {
      status: 'paused',
      icon: '🟡',
      title: 'Paused',
      description: lastRunAt ? `Last ran ${formatDate(lastRunAt)}` : 'Never run',
      color: 'bg-yellow-500/20 text-yellow-400'
    };
  }

  // If enabled but no schedule, show unknown
  if (!schedule) {
    return {
      status: 'unknown',
      icon: '⚪',
      title: 'No Schedule',
      description: 'Configure a schedule to enable automatic runs',
      color: 'bg-white/10 text-white/60'
    };
  }

  // Check recent failures (simplified - in real app you'd track consecutive failures)
  if (lastStatus === 'failed') {
    return {
      status: 'failed',
      icon: '🔴',
      title: 'Failed',
      description: `Last run failed ${formatDate(lastRunAt || '')}`,
      color: 'bg-red-500/20 text-red-400'
    };
  }

  // Check if recently skipped
  if (lastStatus === 'skipped') {
    return {
      status: 'skipped',
      icon: '⏸️',
      title: 'Skipped',
      description: 'No changes detected (normal)',
      color: 'bg-yellow-500/20 text-yellow-400'
    };
  }

  // Active and healthy
  const nextRun = calculateNextRun(schedule);
  return {
    status: 'active',
    icon: '🟢',
    title: 'Active',
    description: `Next run ${nextRun}`,
    color: 'bg-green-500/20 text-green-400'
  };
}

export function AutomationPageClient({ user, repos, connections: initialConnections, allRules: initialAllRules, stats: initialStats }: AutomationPageClientProps) {
  const supabase = createClient();

  const [reposList, setReposList] = useState<Repo[]>(repos);
  const [connections, setConnections] = useState<Connection[]>(initialConnections);
  const [allRules, setAllRules] = useState(initialAllRules);
  const [stats, setStats] = useState(initialStats);
  const [statsRange, setStatsRange] = useState<StatsRange>('all');
  const [activeAutomationRepoId, setActiveAutomationRepoId] = useState<string | null>(null);
  const [automationLoading, setAutomationLoading] = useState<Record<string, boolean>>({});
  const [automationSaving, setAutomationSaving] = useState<Record<string, boolean>>({});
  // Single rule form state (one rule per repo)
  const [singleRuleForm, setSingleRuleForm] = useState<AutomationRuleForm | null>(null);
  const [automationAlerts, setAutomationAlerts] = useState<Record<string, AutomationAlert>>({});
  const [providerResources, setProviderResources] = useState<Record<string, Array<{ id: string; name: string }>>>({});
  const [providerResourceLoading, setProviderResourceLoading] = useState<Record<string, boolean>>({});
  const [providerResourceErrors, setProviderResourceErrors] = useState<Record<string, string>>({});
  const [jiraProjects, setJiraProjects] = useState<Array<{ id: string; key: string; name: string }>>([]);
  const [jiraProjectsLoading, setJiraProjectsLoading] = useState(false);
  const [jiraProjectsError, setJiraProjectsError] = useState('');
  const [jiraProjectsWarning, setJiraProjectsWarning] = useState('');

  // Repository management state
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repoError, setRepoError] = useState('');
  const [repoSuccess, setRepoSuccess] = useState('');

  // Tab management

  // Track expanded repository rows to show automation rules inline
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Delete confirmation modals
  const [deleteRuleModal, setDeleteRuleModal] = useState<{ open: boolean; sourceId: string | null; ruleId: string | null; ruleName: string }>({ open: false, sourceId: null, ruleId: null, ruleName: '' });
  const [deleting, setDeleting] = useState(false);


  // Load repos on mount
  // Update stats by fetching fresh data from server
  const updateStatsFromRules = useCallback(async (range: StatsRange = statsRange) => {
    try {
      // Fetch fresh automation rules from all repos
      let query = supabase
        .from('automation_rules')
        .select(`
	          *,
	          workspace_sources!inner(id, name, repo_url, external_url)
	        `);

      if (user && user.id) {
        query = query.eq('user_id', user.id);
      }

      const { data: rules } = await query;

      // Calculate stats from fresh data
      let totalRules = 0;
      let activeRules = 0;

      const freshAllRules: typeof allRules = [];

      rules?.forEach((rule: {
        id: string;
        source_id: string;
        name?: string;
        enabled?: boolean;
        generate_doc?: boolean;
        generate_diagram?: boolean;
        auto_publish?: boolean;
        schedule?: string;
        last_run_at?: string;
        last_run_status?: string;
        workspace_sources?: {
          name?: string;
          external_url?: string;
          repo_url?: string;
        };
        [key: string]: unknown;
      }) => {
        const enabled = Boolean(rule.enabled);
        totalRules++;
        if (enabled) activeRules++;

        const sourceName = rule.workspace_sources?.name || 'Untitled Source';
        const sourceUrl = rule.workspace_sources?.external_url || rule.workspace_sources?.repo_url || '';
        freshAllRules.push({
          sourceId: rule.source_id,
          sourceName,
          sourceUrl,
          ruleId: rule.id,
          ruleName: (rule.name && rule.name.trim() !== '') ? rule.name : 'Smart Automation',
          enabled,
          generate_doc: typeof rule.generate_doc === 'boolean' ? rule.generate_doc : undefined,
          generate_diagram: typeof rule.generate_diagram === 'boolean' ? rule.generate_diagram : undefined,
          auto_publish: typeof rule.auto_publish === 'boolean' ? rule.auto_publish : undefined,
          schedule: typeof rule.schedule === 'string' ? rule.schedule : undefined,
          lastRunAt: typeof rule.last_run_at === 'string' ? rule.last_run_at : undefined,
          lastRunStatus: typeof rule.last_run_status === 'string' ? rule.last_run_status : undefined,
        });
      });

      // Update local allRules state with fresh data
      setAllRules(freshAllRules);

      // Fetch execution statistics from automation_runs table
      let executions = 0;
      let successfulExecutions = 0;
      let failedExecutions = 0;
      let successRate = 0;

      try {
        const response = await fetch(`/api/automation/stats?range=${encodeURIComponent(range)}`);
        if (response.ok) {
          const stats = await response.json();
          executions = stats.executions || 0;
          successfulExecutions = stats.successfulExecutions || 0;
          failedExecutions = stats.failedExecutions || 0;
          if (typeof stats.successRate === 'number') {
            successRate = stats.successRate;
          } else {
            const totalRuns = successfulExecutions + failedExecutions;
            successRate = totalRuns > 0 ? Math.round((successfulExecutions / totalRuns) * 100) : 0;
          }
        }
      } catch (error) {
        console.error('Failed to fetch automation stats:', error);
      }

      const totalRunsForRate = successfulExecutions + failedExecutions;
      if (successRate === 0 && totalRunsForRate > 0) {
        successRate = Math.round((successfulExecutions / totalRunsForRate) * 100);
      }

      setStats({
        totalRules,
        activeRules,
        executions,
        successRate,
      });
    } catch (error) {
      console.error('Failed to update stats from rules:', error);
    }
  }, [statsRange, supabase, user, setAllRules, setStats]);

  useEffect(() => {
    updateStatsFromRules();
  }, [updateStatsFromRules]);

  async function loadRepos() {
    setLoadingRepos(true);
    try {
      const response = await fetch('/api/repos');
      if (!response.ok) throw new Error('Failed to load sources');
      const data = await response.json();
      setReposList(data || []);
    } catch (err: unknown) {
      setRepoError(err instanceof Error ? err.message : 'Failed to load sources');
      setTimeout(() => setRepoError(''), 5000);
    } finally {
      setLoadingRepos(false);
    }
  }

  function parseRepoUrl(url?: string | null): { owner: string; repo: string } | null {
    if (!url) return null;
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



  async function handleDeleteRule(sourceId: string, ruleId: string) {
    setDeleting(true);
    setRepoError('');
    try {
      // Get current rules
      const response = await fetch(`/api/repos/${sourceId}/automation`, {
        method: 'GET',
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to load automation rules');
      }
      const data = await response.json();
      const currentRules = data.automation_rules || [];

      // Remove the rule
      const updatedRules = currentRules.filter((r: { id?: string; name?: string }) => (r.id || r.name) !== ruleId);

      // Update rules
      const updateResponse = await fetch(`/api/repos/${sourceId}/automation`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ automation_rules: updatedRules }),
      });

      if (!updateResponse.ok) {
        const errorData = await updateResponse.json();
        throw new Error(errorData.error || errorData.detail || 'Failed to delete rule');
      }

      setDeleteRuleModal({ open: false, sourceId: null, ruleId: null, ruleName: '' });
      setRepoSuccess('Rule deleted successfully!');
      setTimeout(() => setRepoSuccess(''), 5000);

      // Refresh automation rules
      if (activeAutomationRepoId === sourceId) {
        await fetchAutomationRules(sourceId);
      }

      // Update stats (which will fetch fresh data and update allRules state)
      updateStatsFromRules();
    } catch (err: unknown) {
      setRepoError(err instanceof Error ? err.message : 'Failed to delete rule');
      setTimeout(() => setRepoError(''), 5000);
    } finally {
      setDeleting(false);
    }
  }


  const loadConnections = useCallback(async () => {
    try {
      const data = await getIntegrationsCached();
      // Map IntegrationConnection[] to Connection[] by adding required fields
      const mappedConnections: Connection[] = (data.connections || []).map((conn) => ({
        id: conn.id || conn.connection_id || '',
        provider: conn.provider || '',
        connection_id: conn.connection_id || conn.id || '',
        status: conn.status || 'inactive',
        metadata: conn.metadata || {},
        created_at: (conn.created_at as string) || new Date().toISOString(),
        updated_at: (conn.updated_at as string) || new Date().toISOString(),
      }));
      setConnections(mappedConnections);
    } catch (err: unknown) {
      console.error('Failed to load connections:', err);
    }
  }, [setConnections]);

  // Load repos and connections on mount
  useEffect(() => {
    loadRepos();
    loadConnections();
  }, [loadConnections]);

  // All the automation helper functions from settings (extracted)
  const createAutomationRuleForm = useCallback((overrides: Partial<AutomationRuleForm> = {}): AutomationRuleForm => {
    return {
      id: overrides.id ?? globalThis.crypto?.randomUUID?.() ?? `rule-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: overrides.name ?? 'Smart Automation',
      enabled: overrides.enabled ?? false,
      customCron: overrides.customCron ?? '0 2 * * *',
      // Individual behavior defaults (docs-only)
      generate_doc: overrides.generate_doc ?? true,
      generate_diagram: overrides.generate_diagram ?? false,
      auto_publish: overrides.auto_publish ?? false,
      auto_approve: overrides.auto_approve ?? false,
      run_diff: overrides.run_diff ?? false,
      target_diagrams: overrides.target_diagrams ?? [],

      // LEGACY: Keep for backward compatibility (not displayed in UI)
      detect_changes: true, // Always true for smart automation
      auto_publish_target_provider: overrides.auto_publish_target_provider ?? '',
      auto_publish_target_connection_id: overrides.auto_publish_target_connection_id ?? '',
      auto_publish_target_resource_id: overrides.auto_publish_target_resource_id ?? '',
      auto_publish_custom_resource: overrides.auto_publish_custom_resource ?? '',
      jira_project_key: overrides.jira_project_key ?? '',
      diff_github_repo_id: overrides.diff_github_repo_id ?? '',
      diff_window_minutes: overrides.diff_window_minutes ?? '',
    };
  }, []);

  function parseSchedule(rule: Record<string, unknown>): {
    customCron: string;
    customScheduleDescription: string;
  } {
    const raw = typeof rule.schedule === 'string' ? rule.schedule.trim() : '';
    // For cron-only schedules, just use the raw value as the cron expression
    // Remove any 'cron:' prefix if it exists for backward compatibility
    const cron = raw.startsWith('cron:') ? raw.replace(/^cron:/, '') : raw;
    let customScheduleDescription = '';
    if (typeof rule.custom_schedule_description === 'string') {
      customScheduleDescription = rule.custom_schedule_description;
    }
    return {
      customCron: cron || '0 2 * * *', // Default to daily at 2 AM
      customScheduleDescription
    };
  }

  const mapRulesToForms = useCallback((rules: Array<Record<string, unknown>>): AutomationRuleForm[] => {
    if (!Array.isArray(rules)) return [];
    return rules.map((rule, index) => {
      const schedule = parseSchedule(rule);

      let generate_doc: boolean = typeof rule.generate_doc === 'boolean' ? rule.generate_doc : true;
      let generate_diagram: boolean = typeof rule.generate_diagram === 'boolean' ? rule.generate_diagram : false;
      let auto_publish: boolean = typeof rule.auto_publish === 'boolean' ? rule.auto_publish : false;
      let auto_approve: boolean = typeof rule.auto_approve === 'boolean' ? rule.auto_approve : Boolean(rule.auto_publish);

      // Backward-compat: infer from action_preset if present
      const actionPreset = typeof rule.action_preset === 'string' ? rule.action_preset : null;
      if (actionPreset) {
        generate_doc = actionPreset !== 'diagrams_only';
        generate_diagram = actionPreset === 'diagrams_only' || actionPreset === 'docs_and_diagrams' || actionPreset === 'full_auto_publish';
        auto_publish = actionPreset === 'full_auto_publish';
        if (actionPreset === 'full_auto_publish' && typeof rule.auto_approve !== 'boolean') {
          auto_approve = true;
        }
      }

      const targetDiagrams = (Array.isArray(rule.target_diagrams) && rule.target_diagrams.length > 0)
        ? rule.target_diagrams
        : (generate_diagram ? ['architecture'] : []);

      let ruleId = `rule-${index}-${Date.now()}`;
      if (typeof rule.id === 'string') {
        ruleId = rule.id;
      }

      let ruleName = 'Smart Automation';
      if (typeof rule.name === 'string' && rule.name.trim() !== '') {
        ruleName = rule.name;
      }

      const enabled = typeof rule.enabled === 'boolean' ? rule.enabled : false;

      // Extract auto_publish_target with type safety
      const autoPublishTarget = (typeof rule.auto_publish_target === 'object' && rule.auto_publish_target !== null)
        ? rule.auto_publish_target as Record<string, unknown>
        : null;

      const getStringProp = (obj: Record<string, unknown> | null, key: string, altKey?: string): string => {
        if (!obj) return '';
        if (typeof obj[key] === 'string') return obj[key] as string;
        if (altKey && typeof obj[altKey] === 'string') return obj[altKey] as string;
        return '';
      };

      const getBooleanProp = (obj: Record<string, unknown> | null, key: string, altKey?: string): boolean => {
        if (!obj) return false;
        if (obj[key] === true || obj[key] === 'diff') return true;
        if (altKey && obj[altKey] === true) return true;
        return false;
      };

      return createAutomationRuleForm({
        id: ruleId,
        name: ruleName,
        enabled,
        customCron: schedule.customCron,

        // Individual behavior fields
        generate_doc,
        generate_diagram,
        auto_publish,
        auto_approve,
        target_diagrams: targetDiagrams,

        // LEGACY: Keep for backward compatibility (not displayed in UI)
        detect_changes: true, // Always true for smart automation
        auto_publish_target_provider: getStringProp(autoPublishTarget, 'provider'),
        auto_publish_target_connection_id: getStringProp(autoPublishTarget, 'connection_id'),
        auto_publish_target_resource_id: getStringProp(autoPublishTarget, 'resource_id'),
        auto_publish_custom_resource: '',
        jira_project_key: getStringProp(autoPublishTarget, 'jira_project_key', 'jiraProjectKey'),
        run_diff: getBooleanProp(autoPublishTarget, 'mode', 'diff') || getBooleanProp(autoPublishTarget, 'diff'),
        diff_github_repo_id: getStringProp(autoPublishTarget, 'github_repo_id', 'githubRepoId'),
        diff_window_minutes: (autoPublishTarget && autoPublishTarget.window_minutes != null)
          ? String(autoPublishTarget.window_minutes)
          : '',
      });
    });
  }, [createAutomationRuleForm]);



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
      .map((item: string | { resource_id?: string; id?: string; name?: string; label?: string }) => {
        if (!item) return null;
        if (typeof item === 'string') return { id: item, name: item };
        const id = item.resource_id || item.id || item.name;
        const name = item.name || item.label || item.resource_id || item.id;
        if (!id) return null;
        return { id, name: name || id };
      })
      .filter(Boolean) as Array<{ id: string; name: string }>;
  }

  const loadResourcesForProvider = useCallback(async (provider: string) => {
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
        .map((resource: {
          id?: string;
          resource_id?: string;
          page_id?: string;
          title?: string;
          name?: string;
          label?: string;
          url?: string;
        }) => {
          const id = resource.id || resource.resource_id || resource.page_id;
          const name = resource.title || resource.name || resource.label || resource.url || resource.id || resource.resource_id || 'Untitled resource';
          return id ? { id, name } : null;
        })
        .filter(Boolean) as Array<{ id: string; name: string }>;

      setProviderResources((prev) => ({ ...prev, [normalizedProvider]: normalized }));
    } catch (err: unknown) {
      console.error('Failed to load resources for provider', provider, err);
      setProviderResourceErrors((prev) => ({ ...prev, [normalizedProvider]: err instanceof Error ? err.message : 'Failed to load resources' }));
    } finally {
      setProviderResourceLoading((prev) => ({ ...prev, [normalizedProvider]: false }));
    }
  }, [providerResources, providerResourceLoading, providerResourceErrors, supabase, setProviderResources, setProviderResourceLoading, setProviderResourceErrors]);

  const loadJiraProjects = useCallback(async () => {
    if (jiraProjectsLoading) return;
    if (jiraProjects.length > 0 && !jiraProjectsError) return;

    setJiraProjectsLoading(true);
    setJiraProjectsError('');
    setJiraProjectsWarning('');

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const response = await fetch('/api/jira/projects', {
        method: 'GET',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.detail || 'Failed to load Jira projects');

      const normalized = (result.projects || [])
        .map((project: {
          key?: string;
          project_key?: string;
          name?: string;
          id?: string;
        }) => {
          const key = project.key || project.project_key;
          const name = project.name || project.key;
          const id = project.id || key;
          if (!key || !name) return null;
          return { id: String(id), key: String(key), name: String(name) };
        })
        .filter(Boolean) as Array<{ id: string; key: string; name: string }>;

      setJiraProjects(normalized);
      if (typeof result.warning === 'string' && result.warning.trim()) {
        setJiraProjectsWarning(result.warning.trim());
      }
    } catch (err: unknown) {
      console.error('Failed to load Jira projects', err);
      setJiraProjectsError(err instanceof Error ? err.message : 'Failed to load Jira projects');
    } finally {
      setJiraProjectsLoading(false);
    }
  }, [jiraProjectsLoading, jiraProjects.length, jiraProjectsError, supabase, setJiraProjects, setJiraProjectsLoading, setJiraProjectsError, setJiraProjectsWarning]);

  function setRuleConnection(connectionId: string, provider: string) {
    if (!singleRuleForm) return;
    const normalizedProvider = normalizeProviderName(provider);
    setSingleRuleForm({
      ...singleRuleForm,
      auto_publish_target_connection_id: connectionId,
      auto_publish_target_provider: normalizedProvider,
      auto_publish_target_resource_id: '',
      auto_publish_custom_resource: '',
      jira_project_key: ''
    });
    if (normalizedProvider && isKnowledgeBaseProvider(normalizedProvider)) {
      loadResourcesForProvider(normalizedProvider);
    }
    if (normalizedProvider === 'confluence') {
      loadJiraProjects();
    }
  }

  function updateSingleRuleField(field: keyof AutomationRuleForm, value: AutomationRuleForm[keyof AutomationRuleForm]) {
    if (!singleRuleForm) return;
    setSingleRuleForm({ ...singleRuleForm, [field]: value });
  }

  function applyPreset(preset: AutomationPreset) {
    if (!singleRuleForm) return;
    const generateDiagram = preset === 'diagrams_only' || preset === 'docs_and_diagrams' || preset === 'full_auto_publish';
    const autoPublish = preset === 'full_auto_publish';
    const autoApprove = autoPublish ? true : singleRuleForm.auto_approve;
    setSingleRuleForm({
      ...singleRuleForm,
      generate_doc: preset !== 'diagrams_only' || autoPublish,
      generate_diagram: generateDiagram,
      auto_publish: autoPublish,
      auto_approve: autoApprove,
    });
  }

  function toggleExpandedRow(sourceId: string) {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sourceId)) {
        newSet.delete(sourceId);
      } else {
        newSet.add(sourceId);
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
    const rule: Record<string, unknown> = {
      id: form.id,
      name: (form.name?.trim() && form.name.trim() !== '') ? form.name.trim() : 'Smart Automation',
      enabled: form.enabled,
      schedule: buildScheduleValue(form),

      // Individual behavior fields (stored in DB)
      generate_doc: form.generate_doc,
      generate_diagram: form.generate_diagram,
      auto_publish: form.auto_publish,
      auto_approve: form.auto_approve,
      target_diagrams: form.target_diagrams || [],
    };

    // Save provider and resource selections for persistence
    if (form.run_diff || form.auto_publish_target_provider || form.auto_publish_target_connection_id || form.auto_publish_target_resource_id) {
      rule.auto_publish_target = {
        provider: form.auto_publish_target_provider || undefined,
        connection_id: form.auto_publish_target_connection_id || undefined,
        resource_id: form.auto_publish_target_resource_id || undefined,
        jira_project_key: form.jira_project_key || undefined,
        mode: form.run_diff ? 'diff' : undefined,
        diff: form.run_diff ? true : undefined,
        github_repo_id: form.diff_github_repo_id || undefined,
        window_minutes: form.diff_window_minutes ? Number(form.diff_window_minutes) : undefined,
      };
    }

    if (form.customScheduleDescription?.trim()) {
      rule.custom_schedule_description = form.customScheduleDescription.trim();
    }

    // LEGACY: Keep for backward compatibility during migration
    rule.detect_changes = true; // Always true for smart automation

    // Default architecture diagrams when diagram generation is selected and no explicit target provided
    const generateDiagram = typeof rule.generate_diagram === 'boolean' ? rule.generate_diagram : false;
    const targetDiagrams = Array.isArray(rule.target_diagrams) ? rule.target_diagrams : [];
    if (generateDiagram && targetDiagrams.length === 0) {
      rule.target_diagrams = ['architecture'];
    }

    return rule;
  }


  const fetchAutomationRules = useCallback(async (sourceId: string) => {
    setAutomationLoading((prev) => ({ ...prev, [sourceId]: true }));
    setAutomationAlerts((prev) => ({ ...prev, [sourceId]: null }));

    try {
      const response = await fetch(`/api/repos/${sourceId}/automation`, { method: 'GET', credentials: 'include' });
      if (!response.ok) {
        const errorDetail = await response.json().catch(() => null);
        throw new Error(errorDetail?.error || errorDetail?.detail || 'Failed to load automation rules');
      }

      const data = await response.json();
      const forms = mapRulesToForms(data.automation_rules || []);
      // For single rule mode, use the first rule or create a new one
      setSingleRuleForm(forms.length > 0 ? forms[0] : createAutomationRuleForm());
    } catch (error: unknown) {
      setAutomationAlerts((prev) => ({ ...prev, [sourceId]: { type: 'error', message: error instanceof Error ? error.message : 'Failed to load automation rules' } }));
    } finally {
      setAutomationLoading((prev) => ({ ...prev, [sourceId]: false }));
    }
  }, [setSingleRuleForm, setAutomationLoading, setAutomationAlerts, mapRulesToForms, createAutomationRuleForm]);

  async function handleSaveAutomationRules(sourceId: string) {
    if (!singleRuleForm) return;

    // Use the current enabled state from the form
    const parsed = [formToRule(singleRuleForm)];

    setAutomationSaving((prev) => ({ ...prev, [sourceId]: true }));
    setAutomationAlerts((prev) => ({ ...prev, [sourceId]: null }));

    try {
      const response = await fetch(`/api/repos/${sourceId}/automation`, {
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

      setAutomationAlerts((prev) => ({ ...prev, [sourceId]: { type: 'success', message: 'Automation rule saved' } }));

      // Close the modal after successful save
      setActiveAutomationRepoId(null);
    } catch (error: unknown) {
      setAutomationAlerts((prev) => ({ ...prev, [sourceId]: { type: 'error', message: error instanceof Error ? error.message : 'Failed to save automation rule' } }));
    } finally {
      setAutomationSaving((prev) => ({ ...prev, [sourceId]: false }));
    }
  }

  async function toggleRuleEnabled(sourceId: string, ruleId: string) {
    try {
      // Fetch current rules from API
      const rulesResponse = await fetch(`/api/repos/${sourceId}/automation`);
      if (!rulesResponse.ok) {
        throw new Error('Failed to fetch current rules');
      }

      const rulesData = await rulesResponse.json();
      const currentRules = rulesData.automation_rules || [];

      // Find and toggle the rule
      const ruleIndex = currentRules.findIndex((r: { id: string; [key: string]: unknown }) => r.id === ruleId);
      if (ruleIndex === -1) return;

      const updatedRules = [...currentRules];
      updatedRules[ruleIndex] = {
        ...updatedRules[ruleIndex],
        enabled: !updatedRules[ruleIndex].enabled
      };

      // Send the update to the server
      const response = await fetch(`/api/repos/${sourceId}/automation`, {
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

      setAutomationAlerts((prev) => ({ ...prev, [sourceId]: { type: 'success', message: 'Automation rule updated' } }));

    } catch (error: unknown) {
      console.error('Failed to toggle rule enabled state:', error);
      setAutomationAlerts((prev) => ({
        ...prev,
        [sourceId]: { type: 'error', message: error instanceof Error ? error.message : 'Failed to update rule' }
      }));
    }
  }

  async function toggleAllRulesEnabled(sourceId: string) {
    try {
      // Fetch current rules from API
      const rulesResponse = await fetch(`/api/repos/${sourceId}/automation`);
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
      const allEnabled = currentRules.every((rule: { enabled?: boolean; [key: string]: unknown }) => rule.enabled);
      const newEnabledState = !allEnabled;

      // Update all rules to the new state
      const updatedRules = currentRules.map((rule: {
        id: string;
        enabled?: boolean;
        [key: string]: unknown;
      }) => ({
        ...rule,
        enabled: newEnabledState
      }));

      // Send the update to the server
      const response = await fetch(`/api/repos/${sourceId}/automation`, {
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

      setAutomationAlerts((prev) => ({
        ...prev,
        [sourceId]: {
          type: 'success',
          message: newEnabledState ? 'All automation rules enabled' : 'All automation rules disabled'
        }
      }));

    } catch (error: unknown) {
      console.error('Failed to toggle all rules enabled state:', error);
      setAutomationAlerts((prev) => ({
        ...prev,
        [sourceId]: { type: 'error', message: error instanceof Error ? error.message : 'Failed to update rules' }
      }));
    }
  }

  async function openAutomationModal(sourceId: string) {
    setActiveAutomationRepoId(sourceId);
    // Load existing rule or create new one
    await fetchAutomationRules(sourceId);
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
  }, [activeAutomationRepoId, fetchAutomationRules, connections.length, loadConnections]);

  // Load resources when a rule with a saved provider is loaded
  useEffect(() => {
    const provider = singleRuleForm?.auto_publish_target_provider;
    if (provider && isKnowledgeBaseProvider(provider)) {
      loadResourcesForProvider(provider);
    }
    if (provider === 'confluence') {
      loadJiraProjects();
    }
  }, [singleRuleForm?.auto_publish_target_provider, loadResourcesForProvider, loadJiraProjects]);

  const activeAutomationRepo = reposList.find((repo) => repo.id === activeAutomationRepoId) || null;
  const knowledgeBaseConnections = connections.filter((connection) => isKnowledgeBaseProvider(connection.provider));

  // Get resource options for single rule form
  const connectionId = singleRuleForm?.auto_publish_target_connection_id;
  const selectedConnection = connectionId ? connections.find((c) => c.connection_id === connectionId || c.id === connectionId) : null;
  const selectedProvider = selectedConnection?.provider || singleRuleForm?.auto_publish_target_provider;
  const normalizedSelectedProvider = normalizeProviderName(selectedProvider || '');
  const providerSupportsResources = Boolean(normalizedSelectedProvider && isKnowledgeBaseProvider(normalizedSelectedProvider));
  const providerResourceList = normalizedSelectedProvider ? providerResources[normalizedSelectedProvider] || [] : [];
  const rawResourceOptions = connectionId ? getResourcesForConnection(connectionId) : providerResourceList;
  
  // Deduplicate resources by id to prevent duplicate key errors
  const resourceOptionsMap = new Map<string, { id: string; name: string }>();
  for (const resource of rawResourceOptions) {
    if (resource && resource.id && !resourceOptionsMap.has(resource.id)) {
      resourceOptionsMap.set(resource.id, resource);
    }
  }
  const resourceOptions = Array.from(resourceOptionsMap.values());
  const providerDisplayName = selectedProvider ? getProviderDisplayName(selectedProvider) : '';
  const resourceLoading = normalizedSelectedProvider ? providerResourceLoading[normalizedSelectedProvider] : false;
  const resourceError = normalizedSelectedProvider ? providerResourceErrors[normalizedSelectedProvider] : '';
  const shouldShowJiraProject = normalizedSelectedProvider === 'confluence';
  const jiraProjectHelper = jiraProjectsLoading
    ? 'Loading Jira projects...'
    : jiraProjectsError
      ? jiraProjectsError
      : jiraProjectsWarning
        ? jiraProjectsWarning
      : jiraProjects.length === 0
        ? 'No Jira projects found for this connection.'
        : 'Select the Jira project to include in daily diffs.';
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
  const statsRangeMeta = STATS_RANGE_OPTIONS.find((option) => option.value === statsRange) || STATS_RANGE_OPTIONS[0];

  // Removed unused helper functions: getStatusIcon, getStatusColor, getStatusIconComponent

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <Card className="border border-white/10 bg-gradient-to-b from-white/5 to-white/0 shadow-lg">
          <CardHeader className="space-y-1 pb-6">
            <div className="flex items-center gap-3">
              <Zap className="h-8 w-8 text-purple-400" />
              <CardTitle className="text-2xl font-semibold text-white">Automation</CardTitle>
            </div>
            <CardDescription className="text-white/70">
              Set it and forget it. Automatically generate and publish documentation when your code changes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 pb-4 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-white/60">Stats range</p>
              <div className="flex flex-wrap gap-2">
                {STATS_RANGE_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    radius="full"
                    variant={statsRange === option.value ? 'secondary' : 'ghost'}
                    onClick={() => setStatsRange(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-white/60">Total Rules</p>
                    <Zap className="h-5 w-5 text-purple-400" />
                  </div>
                  <p className="text-3xl font-semibold text-white">{stats.totalRules}</p>
                  <p className="text-xs text-white/50 mt-1">across {reposList.length} repositories</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-white/60">Active Rules</p>
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  </div>
                  <p className="text-3xl font-semibold text-white">{stats.activeRules}</p>
                  <p className="text-xs text-white/50 mt-1">currently enabled</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-white/60">Executions</p>
                    <TrendingUp className="h-5 w-5 text-blue-400" />
                  </div>
                  <p className="text-3xl font-semibold text-white">{stats.executions}</p>
                  <p className="text-xs text-white/50 mt-1">{statsRangeMeta.description}</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-white/60">Success Rate</p>
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  </div>
                  <p className="text-3xl font-semibold text-white">{stats.successRate}%</p>
                  <p className="text-xs text-white/50 mt-1">{statsRangeMeta.description}</p>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>



        {/* Repository Management Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-white">Repositories & Automation Rules</CardTitle>
            <CardDescription className="text-white/70">Manage your repositories and configure automation rules</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Repositories List */}
            {loadingRepos ? (
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-white/50" />
                  <p className="ml-3 text-white/60">Loading repositories...</p>
                </CardContent>
              </Card>
            ) : reposList.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <Github className="h-12 w-12 text-white/30 mx-auto mb-4" />
                  <p className="text-white/60 mb-2">No repositories registered yet.</p>
                  <p className="text-white/50 text-sm">Connect repositories through the repository setup process to enable automation.</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <CardContent className="p-0">
                  <table className="w-full">
                    <thead className="border-b border-white/10 bg-white/5">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-white/90 w-8"></th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-white/90">Repository</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-white/90">Branch</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-white/90">Automation</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-white/90">Next Run</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-white/90">Last Run</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-white/90">Added</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-white/90">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {reposList.map((repo) => {
                        const displayUrl = repo.external_url || repo.repo_url || '';
                        const repoInfo = parseRepoUrl(displayUrl);
                        const repoRules = allRules.filter((r) => r.sourceId === repo.id);
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
                                      {displayUrl}
                                  </div>
                                    {(() => {
                                      const subdir = repo.settings?.subdir;
                                      return typeof subdir === 'string' && subdir ? (
                                        <div className="text-xs text-white/40 mt-0.5">
                                          Path: {subdir}
                                        </div>
                                      ) : null;
                                    })()}
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
                                  <div className="flex items-center gap-2">
                                    {(() => {
                                      const enhancedStatus = getEnhancedStatus(repoRules[0]);
                                      return (
                                        <div className="flex flex-col items-start gap-0.5">
                                          <div className={`rounded-full px-2 py-0.5 text-xs font-medium ${enhancedStatus.color} flex items-center gap-1.5 w-fit`}>
                                            <span>{enhancedStatus.icon}</span>
                                            <span className="font-semibold">{enhancedStatus.title}</span>
                                          </div>
                                          <span className="text-xs text-white/60 max-w-32 truncate">{enhancedStatus.description}</span>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                ) : (
                                  <span className="text-xs text-white/40">No rules</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-white/70">
                                {hasRules && repoRules[0] && repoRules[0].schedule ? calculateNextRun(repoRules[0].schedule) : '—'}
                              </td>
                              <td className="px-4 py-3 text-sm text-white/70">
                                {hasRules && repoRules[0]?.lastRunAt ? formatDate(repoRules[0].lastRunAt) : 'Never'}
                              </td>
                              <td className="px-4 py-3 text-sm text-white/70">
                                {new Date(repo.created_at).toLocaleDateString()}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-2">
                                  {hasRules && (
                                    <>
                                     <Switch
                                       checked={activeRules > 0}
                                        onCheckedChange={() => toggleAllRulesEnabled(repo.id)}
                                        aria-label={activeRules > 0 ? 'Disable all rules' : 'Enable all rules'}
                                        className="scale-90"
                                     />
                                    </>
                                  )}
                                  <Button
                                   onClick={(e) => {
                                     e.stopPropagation();
                                      openAutomationModal(repo.id);
                                    }}
                                    variant="secondary"
                                    size="sm"
                                    className="gap-2 border-white/20 bg-white/10 text-white/80 hover:bg-white/15"
                                    title="Configure automation rules"
                                  >
                                    <Zap className="h-3 w-3" />
                                    {hasRules ? 'Manage' : 'Setup'}
                                  </Button>
                                  {repoInfo && (
                                    <Button
                                      asChild
                                      variant="secondary"
                                      size="sm"
                                      className="gap-2 border-white/20 bg-white/10 text-white/90 hover:bg-white/15"
                                      title="Open repository on GitHub"
                                    >
                                      <a
                                  href={displayUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>

                            {/* Expanded Automation Rules Row */}
                            {isExpanded && (
                              <tr>
                                <td colSpan={8} className="px-0 py-0">
                                  <div className="border-t border-white/10 bg-white/5">
                                    <div className="p-6">
                                      {/* Automation Rules Content */}
                                      {repoRules.length > 0 ? (
                                        <div className="space-y-4">
                                          {repoRules.map((rule) => (
                                            <div key={rule.ruleId} className="rounded-lg border border-white/10 bg-black/40 p-4">
                                              <div className="flex items-start justify-between gap-3 mb-3">
                                                <div className="flex-1 min-w-0">
                                                  <div className="flex items-center gap-2 mb-1">
                                                    <div className="flex-1 min-w-0">
                                                      <h4 className="font-semibold text-white">{rule.ruleName}</h4>
                                                      <p className="text-xs text-white/50">ID: {rule.ruleId}</p>
                                                    </div>
                                                    {(() => {
                                                      const enhancedStatus = getEnhancedStatus(rule);
                                                      return (
                                                        <div className={`rounded-full px-2 py-0.5 text-xs flex items-center gap-1 ${enhancedStatus.color}`}>
                                                          <span>{enhancedStatus.icon}</span>
                                                          <span>{enhancedStatus.title}</span>
                                                        </div>
                                                      );
                                                    })()}
                                                  </div>
                                                  <p className="text-sm text-white/70 mb-2">
                                                    {presetFromFlags(rule) === 'docs_only' && '📄 Generates documentation only'}
                                                    {presetFromFlags(rule) === 'full_auto_publish' && '🚀 Auto-generates and publishes'}
                                                  </p>
                                                  <div className="flex items-center gap-4 text-xs text-white/60">
                                                    <span>Schedule: {rule.schedule ? getCronDescription(rule.schedule) : 'Not set'}</span>
                                                    {rule.lastRunAt && (
                                                      <span>Last run: {formatDate(rule.lastRunAt)}</span>
                                                    )}
                                                  </div>
                                                </div>
                                              </div>

                                              <div className="flex items-center gap-2">
                                                <Switch
                                                  checked={rule.enabled}
                                                  onCheckedChange={() => toggleRuleEnabled(repo.id, rule.ruleId)}
                                                  aria-label={rule.enabled ? 'Disable rule' : 'Enable rule'}
                                                  className="scale-90"
                                                />
                                                <Button
                                                  variant="secondary"
                                                  size="icon"
                                                  onClick={() => setDeleteRuleModal({
                                                    open: true,
                                                    sourceId: repo.id,
                                                    ruleId: rule.ruleId,
                                                    ruleName: rule.ruleName
                                                  })}
                                                  className="border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20"
                                                  title="Delete rule"
                                                >
                                                  <Trash2 className="h-4 w-4" />
                                                </Button>
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
                </CardContent>
              </Card>
            )}

            {/* Error/Success Messages */}
            {(repoError || repoSuccess) && (
              <div className="mt-4 space-y-2">
                {repoError && (
                  <Alert variant="destructive">
                    <AlertDescription>{repoError}</AlertDescription>
                  </Alert>
                )}
                {repoSuccess && (
                  <Alert variant="success">
                    <AlertDescription>{repoSuccess}</AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </CardContent>
        </Card>




        {/* Delete Rule Confirmation Modal */}
        <Dialog open={deleteRuleModal.open} onOpenChange={(open) => !open && !deleting && setDeleteRuleModal({ open: false, sourceId: null, ruleId: null, ruleName: '' })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Automation Rule</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete the rule <span className="font-semibold">{deleteRuleModal.ruleName}</span>? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setDeleteRuleModal({ open: false, sourceId: null, ruleId: null, ruleName: '' })}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteRuleModal.sourceId && deleteRuleModal.ruleId && handleDeleteRule(deleteRuleModal.sourceId, deleteRuleModal.ruleId)}
                disabled={deleting}
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Automation Configuration Modal */}
        <Dialog open={!!activeAutomationRepo} onOpenChange={(open) => !open && closeAutomationModal()}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Automation Rules</DialogTitle>
              <DialogDescription>
                Schedule documentation updates for {activeAutomationRepo?.name} with clear triggers and publishing behavior.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              {activeAutomationRepo && automationLoading[activeAutomationRepo.id] ? (
                <Card>
                  <CardContent className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    <span className="text-sm text-white/60">Loading automation rule...</span>
                  </CardContent>
                </Card>
              ) : singleRuleForm ? (
                <div className="space-y-6 overflow-y-auto px-6 py-6" style={{ maxHeight: 'calc(90vh - 140px)' }}>
                  <div className="space-y-5 rounded-2xl border border-white/10 bg-black/40 p-5">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-white">Configure Automation Rule</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant={singleRuleForm.enabled ? 'default' : 'secondary'}
                          size="sm"
                          onClick={() => updateSingleRuleField('enabled', !singleRuleForm.enabled)}
                        >
                          {singleRuleForm.enabled ? 'Enabled' : 'Disabled'}
                        </Button>
                        <p className="text-xs text-white/60">When off, the rule is ignored. Rules are automatically enabled when saved.</p>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="text-sm text-white/80">
                        Rule label
                        <Input
                          value={singleRuleForm.name}
                          onChange={(event) => updateSingleRuleField('name', event.target.value)}
                          className="mt-1 w-full border border-white/20 bg-black/60 text-sm text-white"
                          placeholder="e.g., Nightly documentation"
                        />
                      </label>
                      <div>
                        <label className="text-sm text-white/80">
                          Schedule (Cron Expression)
                        </label>

                        {/* Cron Expression Input */}
                        <Input
                          value={singleRuleForm.customCron}
                          onChange={(event) => updateSingleRuleField('customCron', event.target.value)}
                          placeholder="0 2 * * * (daily at 2 AM UTC)"
                          className={`mt-1 w-full border px-3 py-2 text-sm text-white font-mono ${singleRuleForm.customCron && !isValidCron(singleRuleForm.customCron)
                            ? 'border-red-500/50 bg-red-900/20'
                            : 'border-white/20 bg-black/60'
                            }`}
                        />

                        {/* Quick Preset Buttons */}
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => updateSingleRuleField('customCron', '0 2 * * *')}
                            className="text-xs bg-blue-600/20 text-blue-100 hover:bg-blue-600/30"
                          >
                            Daily 2 AM
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => updateSingleRuleField('customCron', '0 9 * * *')}
                            className="text-xs bg-blue-600/20 text-blue-100 hover:bg-blue-600/30"
                          >
                            Daily 9 AM
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => updateSingleRuleField('customCron', '0 */6 * * *')}
                            className="text-xs bg-blue-600/20 text-blue-100 hover:bg-blue-600/30"
                          >
                            Every 6 hours
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => updateSingleRuleField('customCron', '*/30 * * * *')}
                            className="text-xs bg-blue-600/20 text-blue-100 hover:bg-blue-600/30"
                          >
                            Every 30 min
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => updateSingleRuleField('customCron', '0 9 * * 1')}
                            className="text-xs bg-blue-600/20 text-blue-100 hover:bg-blue-600/30"
                          >
                            Weekly Monday 9 AM
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => updateSingleRuleField('customCron', '0 0 * * 1')}
                            className="text-xs bg-blue-600/20 text-blue-100 hover:bg-blue-600/30"
                          >
                            Weekly Monday
                          </Button>
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
                          {singleRuleForm && (
                            <div className="text-xs text-green-400 font-medium flex items-center gap-1">
                              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                              Active: {
                                singleRuleForm.run_diff ? '🫧 Daily Diff' :
                                  presetFromFlags(singleRuleForm) === 'docs_only' ? '📄 Docs Only' :
                                    presetFromFlags(singleRuleForm) === 'diagrams_only' ? '🏛 Architecture Diagrams' :
                                      presetFromFlags(singleRuleForm) === 'docs_and_diagrams' ? '📄 + 🏛 Docs & Diagrams' :
                                        presetFromFlags(singleRuleForm) === 'full_auto_publish' ? '🚀 Auto-Publish' :
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
                              label: '🏛 Keep Architecture Diagram Updated',
                              description: 'Regenerate the architecture diagram when code changes'
                            },
                            {
                              value: 'docs_and_diagrams',
                              label: '📄 + 🏛 Docs & Diagrams',
                              description: 'Regenerate both docs and architecture diagrams automatically'
                            },
                          {
                            value: 'full_auto_publish',
                            label: '🚀 Full Auto-Publish',
                            description: 'Update content and publish to configured knowledge bases'
                          }
                        ].map((preset) => {
                          const isSelected = presetFromFlags(singleRuleForm) === preset.value;
                          return (
                              <Button
                                key={preset.value}
                                type="button"
                                variant="outline"
                                className={`relative flex w-full flex-col items-start gap-1 rounded-lg border-2 p-4 text-left transition-all ${
                                  isSelected
                                    ? 'border-green-500 bg-green-500/15 text-green-100 shadow-lg shadow-green-500/20'
                                    : 'border-white/20 bg-white/5 text-white/80 hover:border-white/30 hover:bg-white/10'
                                }`}
                                onClick={() => applyPreset(preset.value as AutomationPreset)}
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
                              </Button>
                          );
                        })}
                        </div>
                      </div>

                    </div>

                    <div className="rounded-lg border border-white/10 bg-gradient-to-r from-slate-900/60 via-cyan-900/30 to-slate-900/60 p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-white/90">Send daily activity diff</p>
                          <p className="text-xs text-white/60">
                            Push a Jira + GitHub activity snapshot to your knowledge base on this schedule.
                          </p>
                        </div>
                        <Switch
                          checked={Boolean(singleRuleForm?.run_diff)}
                          onCheckedChange={(value) => updateSingleRuleField('run_diff', value)}
                          aria-label={singleRuleForm?.run_diff ? 'Disable daily diff' : 'Enable daily diff'}
                          className="scale-90"
                        />
                      </div>
                      {singleRuleForm?.run_diff && (
                        <div className="mt-3 space-y-3">
                          <p className="text-xs text-white/50">
                            Note: Daily diff runs instead of document generation for this rule.
                          </p>
                          <div className="space-y-2">
                            <label className="text-xs text-white/70">GitHub repository for diff</label>
                            <select
                              value={singleRuleForm.diff_github_repo_id || ''}
                              onChange={(event) => updateSingleRuleField('diff_github_repo_id', event.target.value)}
                              className="w-full rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                            >
                              <option value="">Use this repo (if GitHub)</option>
                              {reposList
                                .filter((r) => r.provider === 'github')
                                .map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.name}
                                  </option>
                                ))}
                            </select>
                            {activeAutomationRepo?.provider !== 'github' && !singleRuleForm.diff_github_repo_id && (
                              <p className="text-xs text-amber-300">
                                Select a GitHub repo for the diff.
                              </p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs text-white/70">Diff window</label>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => updateSingleRuleField('diff_window_minutes', '10')}
                                className="text-xs bg-blue-600/20 text-blue-100 hover:bg-blue-600/30"
                              >
                                Last 10 min
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => updateSingleRuleField('diff_window_minutes', '60')}
                                className="text-xs bg-blue-600/20 text-blue-100 hover:bg-blue-600/30"
                              >
                                Last 1 hour
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => updateSingleRuleField('diff_window_minutes', '1440')}
                                className="text-xs bg-blue-600/20 text-blue-100 hover:bg-blue-600/30"
                              >
                                Day over day
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => updateSingleRuleField('diff_window_minutes', '10080')}
                                className="text-xs bg-blue-600/20 text-blue-100 hover:bg-blue-600/30"
                              >
                                Week over week
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => updateSingleRuleField('diff_window_minutes', '43200')}
                                className="text-xs bg-blue-600/20 text-blue-100 hover:bg-blue-600/30"
                              >
                                Month over month
                              </Button>
                            </div>
                            <Input
                              value={singleRuleForm.diff_window_minutes || ''}
                              onChange={(event) => updateSingleRuleField('diff_window_minutes', event.currentTarget.value.replace(/[^\d]/g, ''))}
                              placeholder="10"
                            />
                            <p className="text-xs text-white/40">
                              Minutes for the window. Presets above set this automatically.
                            </p>
                          </div>
                          {singleRuleForm?.auto_publish_target_provider === 'confluence' && (
                            <div className="space-y-2">
                              <label className="text-xs text-white/70">Confluence page ID (cloudId:pageId)</label>
                              <Input
                                value={singleRuleForm.auto_publish_target_resource_id || ''}
                                onChange={(event) => updateSingleRuleField('auto_publish_target_resource_id', event.currentTarget.value)}
                                placeholder="cloudId:pageId"
                              />
                              <p className="text-xs text-white/40">
                                Use a page ID to update one page. If you select a space above, a new page may be created instead.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>


                    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-white/90">Auto-approve doc updates</p>
                          <p className="text-xs text-white/60">
                            Apply regenerated documentation automatically without manual review.
                          </p>
                        </div>
                        <Switch
                          checked={Boolean(singleRuleForm?.auto_approve)}
                          onCheckedChange={(value) => updateSingleRuleField('auto_approve', value)}
                          aria-label={singleRuleForm?.auto_approve ? 'Disable auto-approve' : 'Enable auto-approve'}
                          className="scale-90"
                        />
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
                    {shouldShowJiraProject && (
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="text-sm text-white/80">
                          Jira project (optional)
                          <select
                            value={singleRuleForm.jira_project_key || ''}
                            onChange={(event) => updateSingleRuleField('jira_project_key', event.target.value)}
                            className="mt-1 w-full rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                          >
                            <option value="">No Jira project</option>
                            {singleRuleForm.jira_project_key &&
                              !jiraProjects.some((project) => project.key === singleRuleForm.jira_project_key) && (
                                <option value={singleRuleForm.jira_project_key}>
                                  {singleRuleForm.jira_project_key} (saved)
                                </option>
                              )}
                            {jiraProjects.map((project) => (
                              <option key={project.key} value={project.key}>
                                {project.key} — {project.name}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-white/50 mt-1">{jiraProjectHelper}</p>
                        </label>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button
                        type="button"
                        onClick={() => activeAutomationRepoId && handleSaveAutomationRules(activeAutomationRepoId)}
                        disabled={Boolean(activeAutomationRepoId && automationSaving[activeAutomationRepoId])}
                      >
                        {activeAutomationRepoId && automationSaving[activeAutomationRepoId] ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          'Save Rule'
                        )}
                      </Button>
                    </div>
                  </div>

                  {activeAutomationRepoId && automationAlerts[activeAutomationRepoId] && (
                    <Alert variant={automationAlerts[activeAutomationRepoId]?.type === 'error' ? 'destructive' : 'success'} className="mt-2">
                      <AlertDescription>{automationAlerts[activeAutomationRepoId]?.message}</AlertDescription>
                    </Alert>
                  )}
                </div>
              ) : (
                <Card>
                  <CardContent className="flex items-center justify-center py-12">
                    <p className="text-sm text-white/60">No rule form available</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
