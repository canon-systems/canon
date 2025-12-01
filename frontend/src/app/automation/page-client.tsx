'use client';

import { useState, useEffect, useRef } from 'react';
import { Zap, Plus, CheckCircle2, XCircle, Clock, Loader2, Sliders, GitBranch, ExternalLink, Link as LinkIcon, TrendingUp, Search, ChevronDown, FileText, Github, Trash2, PlayCircle, StopCircle } from 'lucide-react';
import Link from 'next/link';
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
  scheduleType: 'minutes' | 'hours' | 'daily' | 'weekly' | 'monthly' | 'custom';
  scheduleTime: string;
  scheduleDay: string;
  customCron: string;
  scheduleIntervalValue: string;
  scheduleMonthDay: string;
  customScheduleDescription: string;
  detect_changes: boolean;
  generate_doc: boolean;
  generate_diagram: boolean;
  auto_publish: boolean;
  auto_publish_new_docs: boolean;
  auto_publish_max_changes: string;
  auto_publish_max_change_percentage: string;
  auto_publish_target_provider: string;
  auto_publish_target_connection_id: string;
  auto_publish_target_resource_id: string;
  auto_publish_custom_resource: string;
  significance_analysis_enabled: boolean;
  significance_sensitivity: 'strict' | 'balanced' | 'lenient';
  significance_require_technical: boolean;
  significance_require_business: boolean;
  significance_minimum_confidence: 'high' | 'medium' | 'low';
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

export function AutomationPageClient({ repos, connections: initialConnections, allRules: initialAllRules, stats: initialStats }: AutomationPageClientProps) {
  const supabase = createClient();
  
  const [reposList, setReposList] = useState<Repo[]>(repos);
  const [connections, setConnections] = useState<Connection[]>(initialConnections);
  const [allRules, setAllRules] = useState(initialAllRules);
  const [stats, setStats] = useState(initialStats);
  const [activeAutomationRepoId, setActiveAutomationRepoId] = useState<string | null>(null);
  const [automationLoading, setAutomationLoading] = useState<Record<string, boolean>>({});
  const [automationSaving, setAutomationSaving] = useState<Record<string, boolean>>({});
  const [, setAutomationCache] = useState<Record<string, AutomationRulesResponse>>({});
  // Single rule form state (one rule per repo)
  const [singleRuleForm, setSingleRuleForm] = useState<AutomationRuleForm | null>(null);
  const [automationAlerts, setAutomationAlerts] = useState<Record<string, AutomationAlert>>({});
  const [providerResources, setProviderResources] = useState<Record<string, Array<{ id: string; name: string }>>>({});
  const [providerResourceLoading, setProviderResourceLoading] = useState<Record<string, boolean>>({});
  const [providerResourceErrors, setProviderResourceErrors] = useState<Record<string, string>>({});
  const [, setAutomationConfigOpen] = useState(false);

  // Repository management state
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formRepoUrl, setFormRepoUrl] = useState('');
  const [formBranch, setFormBranch] = useState('main');
  const [formSubdir, setFormSubdir] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [ownerInput, setOwnerInput] = useState('');
  const [baseOwner, setBaseOwner] = useState('');
  const [showRepoSelector, setShowRepoSelector] = useState(false);
  const [availableRepos, setAvailableRepos] = useState<Array<{ name: string; full_name: string; url: string; private: boolean }>>([]);
  const [loadingRepoSearch, setLoadingRepoSearch] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [directories, setDirectories] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingDirectories, setLoadingDirectories] = useState(false);
  const [repoSuccess, setRepoSuccess] = useState('');
  const [repoError, setRepoError] = useState('');

  // Tab management
  type AutomationTab = 'repos' | 'rules' | 'runs';
  const [activeTab, setActiveTab] = useState<AutomationTab>('repos');
  
  // Track expanded error states for runs
  const [expandedErrors, setExpandedErrors] = useState<Record<string, boolean>>({});
  
  // Delete confirmation modals
  const [deleteRepoModal, setDeleteRepoModal] = useState<{ open: boolean; repoId: string | null; repoName: string }>({ open: false, repoId: null, repoName: '' });
  const [deleteRuleModal, setDeleteRuleModal] = useState<{ open: boolean; repoId: string | null; ruleId: string | null; ruleName: string }>({ open: false, repoId: null, ruleId: null, ruleName: '' });
  const [deleting, setDeleting] = useState(false);

  // Manual rule execution state
  const [runningRules, setRunningRules] = useState<Record<string, boolean>>({});
  const [runResults, setRunResults] = useState<Record<string, { success: boolean; message: string; docId?: string | null } | null>>({});
  
  // Abort controllers for cancelling running rules
  const abortControllersRef = useRef<Record<string, AbortController>>({});

  // Load repos on mount
  useEffect(() => {
    loadRepos();
    loadConnections();
  }, []);

  // Recalculate allRules and stats from repos data
  function recalculateRulesAndStats(repos: Repo[]) {
    const newAllRules: Array<{
      repoId: string;
      repoName: string;
      repoUrl: string;
      ruleId: string;
      ruleName: string;
      enabled: boolean;
      lastRunAt?: string;
      lastRunStatus?: string;
      lastExecution?: any;
    }> = [];

    let totalRules = 0;
    let activeRules = 0;
    let totalExecutions24h = 0;
    let successfulExecutions = 0;

    repos.forEach((repo) => {
      const settings = repo.settings || {};
      const rules = Array.isArray(settings.automation_rules) ? settings.automation_rules : [];
      const metadata = settings.automation_metadata || {};

      rules.forEach((rule: any) => {
        const ruleId = rule.id || rule.name || 'default';
        const ruleMetadata = metadata[ruleId] || {};
        const enabled = Boolean(rule.enabled);
        
        totalRules++;
        if (enabled) activeRules++;

        // Count executions in last 24h
        const executionHistory = ruleMetadata.execution_history || [];
        const now = new Date();
        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        const recentExecutions = executionHistory.filter((exec: any) => {
          try {
            const execTime = new Date(exec.timestamp);
            return execTime >= last24h;
          } catch {
            return false;
          }
        });

        totalExecutions24h += recentExecutions.length;
        successfulExecutions += recentExecutions.filter((e: any) => e.success && !e.skipped).length;

        newAllRules.push({
          repoId: repo.id,
          repoName: repo.name || 'Untitled Repo',
          repoUrl: repo.repo_url || '',
          ruleId,
          ruleName: rule.name || ruleId,
          enabled,
          lastRunAt: ruleMetadata.last_run_at,
          lastRunStatus: ruleMetadata.last_run_status,
          lastExecution: ruleMetadata.last_execution,
        });
      });
    });

    const successRate = totalExecutions24h > 0 
      ? Math.round((successfulExecutions / totalExecutions24h) * 100) 
      : 0;

    setAllRules(newAllRules);
    setStats({
      totalRules,
      activeRules,
      executions24h: totalExecutions24h,
      successRate,
    });
  }

  async function loadRepos() {
    setLoadingRepos(true);
    try {
      const response = await fetch('/api/repos');
      if (!response.ok) throw new Error('Failed to load repositories');
      const data = await response.json();
      setReposList(data || []);
      // Recalculate rules and stats from the fetched repos data
      recalculateRulesAndStats(data || []);
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

  function searchRepos() {
    if (ownerInput.trim()) {
      setShowRepoSelector(true);
      const trimmed = ownerInput.trim();
      const cleanOwner = trimmed
        .replace(/^https?:\/\/github\.com\//, '')
        .replace(/\/$/, '')
        .split('/')[0];
      if (cleanOwner && cleanOwner !== baseOwner) {
        setBaseOwner(cleanOwner);
        fetchRepos(cleanOwner);
      }
    } else {
      setShowRepoSelector(false);
      setBaseOwner('');
      setAvailableRepos([]);
    }
  }

  async function fetchRepos(owner: string) {
    if (!owner || loadingRepoSearch) return;
    setLoadingRepoSearch(true);
    try {
      const response = await fetch('/api/github/repos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ owner })
      });
      if (response.ok) {
        const data = await response.json();
        setAvailableRepos((data.repos || [])
          .filter((r: any) => r && r.name && r.full_name && r.url)
          .map((r: { name: string; full_name: string; url: string; private: boolean }) => ({
            name: r.name,
            full_name: r.full_name,
            url: r.url,
            private: r.private || false
          })));
      } else {
        setAvailableRepos([]);
      }
    } catch (err) {
      console.error('Failed to fetch repos:', err);
      setAvailableRepos([]);
    } finally {
      setLoadingRepoSearch(false);
    }
  }

  function handleRepoSelect(repo: { name: string; full_name: string; url: string }) {
    setFormRepoUrl(repo.url);
    setFormName(repo.name);
    setShowRepoSelector(false);
    setOwnerInput('');
    setBaseOwner('');
    setAvailableRepos([]);
  }

  async function handleAddRepo() {
    if (!formName || !formRepoUrl) {
      setRepoError('Name and repository URL are required');
      setTimeout(() => setRepoError(''), 5000);
      return;
    }
    setFormSubmitting(true);
    setRepoError('');
    setRepoSuccess('');
    try {
      const settings: any = {};
      if (formSubdir) {
        settings.subdir = formSubdir;
      }
      const response = await fetch('/api/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          provider: 'github',
          repo_url: formRepoUrl,
          default_branch: formBranch,
          auth_type: 'github_pat',
          settings,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.detail || 'Failed to create repository');
      }
      // Reset form and reload
      setFormName('');
      setFormRepoUrl('');
      setFormBranch('main');
      setFormSubdir('');
      setOwnerInput('');
      setBaseOwner('');
      setShowRepoSelector(false);
      setAvailableRepos([]);
      setBranches([]);
      setDirectories([]);
      setShowAddForm(false);
      setRepoSuccess('Repository added successfully!');
      setTimeout(() => setRepoSuccess(''), 5000);
      await loadRepos();
      // Refresh the page to update stats
      window.location.reload();
    } catch (err: any) {
      setRepoError(err.message || 'Failed to add repository');
      setTimeout(() => setRepoError(''), 5000);
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleDeleteRepo(repoId: string) {
    setDeleting(true);
    setRepoError('');
    try {
      const response = await fetch(`/api/repos/${repoId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.detail || 'Failed to delete repository');
      }
      setDeleteRepoModal({ open: false, repoId: null, repoName: '' });
      setRepoSuccess('Repository deleted successfully!');
      setTimeout(() => setRepoSuccess(''), 5000);
      await loadRepos();
      // Refresh the page to update stats
      window.location.reload();
    } catch (err: any) {
      setRepoError(err.message || 'Failed to delete repository');
      setTimeout(() => setRepoError(''), 5000);
    } finally {
      setDeleting(false);
    }
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
      
      // Refresh the page to update stats
      window.location.reload();
    } catch (err: any) {
      setRepoError(err.message || 'Failed to delete rule');
      setTimeout(() => setRepoError(''), 5000);
    } finally {
      setDeleting(false);
    }
  }

  async function handleRunRule(repoId: string, ruleId: string) {
    const key = `${repoId}-${ruleId}`;
    
    // Create abort controller for this run
    const abortController = new AbortController();
    abortControllersRef.current[key] = abortController;
    
    setRunningRules((prev) => ({ ...prev, [key]: true }));
    setRunResults((prev) => ({ ...prev, [key]: null }));
    
    try {
      const response = await fetch(`/api/repos/${repoId}/automation/run`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleId }),
        signal: abortController.signal,
      });
      
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
      
      setRunResults((prev) => ({
        ...prev,
        [key]: {
          success: data.success && !data.skipped,
          message,
          docId: data.docId,
        },
      }));
      
      // Auto-clear result after 10 seconds
      setTimeout(() => {
        setRunResults((prev) => ({ ...prev, [key]: null }));
      }, 10000);
      
      // Refresh to update stats
      await loadRepos();
    } catch (err: any) {
      // Check if this was a cancellation
      if (err.name === 'AbortError') {
        setRunResults((prev) => ({
          ...prev,
          [key]: {
            success: false,
            message: 'Run cancelled by user',
          },
        }));
      } else {
        setRunResults((prev) => ({
          ...prev,
          [key]: {
            success: false,
            message: err.message || 'Failed to run rule',
          },
        }));
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
      scheduleType: overrides.scheduleType ?? 'daily',
      scheduleTime: overrides.scheduleTime ?? '02:00',
      scheduleDay: overrides.scheduleDay ?? 'monday',
      customCron: overrides.customCron ?? '',
      scheduleIntervalValue: overrides.scheduleIntervalValue ?? '1',
      scheduleMonthDay: overrides.scheduleMonthDay ?? '1',
      customScheduleDescription: overrides.customScheduleDescription ?? '',
      detect_changes: overrides.detect_changes ?? true,
      generate_doc: overrides.generate_doc ?? true,
      generate_diagram: overrides.generate_diagram ?? false,
      auto_publish: overrides.auto_publish ?? false,
      auto_publish_new_docs: overrides.auto_publish_new_docs ?? false,
      significance_analysis_enabled: overrides.significance_analysis_enabled ?? true,
      significance_sensitivity: overrides.significance_sensitivity ?? 'balanced',
      significance_require_technical: overrides.significance_require_technical ?? false,
      significance_require_business: overrides.significance_require_business ?? false,
      significance_minimum_confidence: overrides.significance_minimum_confidence ?? 'medium',
      auto_publish_max_changes: overrides.auto_publish_max_changes ?? '50',
      auto_publish_max_change_percentage: overrides.auto_publish_max_change_percentage ?? '5',
      auto_publish_target_provider: overrides.auto_publish_target_provider ?? '',
      auto_publish_target_connection_id: overrides.auto_publish_target_connection_id ?? '',
      auto_publish_target_resource_id: overrides.auto_publish_target_resource_id ?? '',
      auto_publish_custom_resource: overrides.auto_publish_custom_resource ?? ''
    };
  }

  function parseSchedule(rule: Record<string, any>): {
    scheduleType: AutomationRuleForm['scheduleType'];
    scheduleTime: string;
    scheduleDay: string;
    customCron: string;
    scheduleIntervalValue: string;
    scheduleMonthDay: string;
    customScheduleDescription: string;
  } {
    const raw = (rule.schedule || '').trim();
    const base = {
      scheduleType: 'daily' as AutomationRuleForm['scheduleType'],
      scheduleTime: '02:00',
      scheduleDay: 'monday',
      customCron: '',
      scheduleIntervalValue: '1',
      scheduleMonthDay: '1',
      customScheduleDescription: rule?.custom_schedule_description ?? ''
    };

    if (!raw) return base;

    if (raw.startsWith('cron:')) {
      return { ...base, scheduleType: 'custom', customCron: raw.replace(/^cron:/, '') };
    }

    if (raw.startsWith('interval:')) {
      const match = raw.match(/^interval:(\d+)([mhd])$/);
      if (match) {
        const value = match[1] || '1';
        const unit = match[2];
        if (unit === 'm') return { ...base, scheduleType: 'minutes', scheduleIntervalValue: value };
        if (unit === 'h') return { ...base, scheduleType: 'hours', scheduleIntervalValue: value };
        if (unit === 'd') return { ...base, scheduleType: 'daily', scheduleIntervalValue: value };
      }
    }

    if (raw.startsWith('every_')) {
      const day = raw.split('_')[1] || 'monday';
      return { ...base, scheduleType: 'weekly', scheduleDay: day };
    }

    return base;
  }

  function mapRulesToForms(rules: Record<string, any>[]): AutomationRuleForm[] {
    if (!Array.isArray(rules)) return [];
    return rules.map((rule, index) => {
      const schedule = parseSchedule(rule);
      return createAutomationRuleForm({
        id: rule.id || `rule-${index}-${Date.now()}`,
        name: rule.name ?? '',
        enabled: rule.enabled ?? false,
        scheduleType: schedule.scheduleType,
        scheduleTime: schedule.scheduleTime,
        scheduleDay: schedule.scheduleDay,
        customCron: schedule.customCron,
        scheduleIntervalValue: schedule.scheduleIntervalValue,
        scheduleMonthDay: schedule.scheduleMonthDay,
        customScheduleDescription: schedule.customScheduleDescription,
        detect_changes: rule.detect_changes ?? true,
        generate_doc: rule.generate_doc ?? true,
        generate_diagram: rule.generate_diagram ?? false,
        auto_publish: rule.auto_publish ?? false,
        auto_publish_new_docs: rule.auto_publish_new_docs ?? false,
        significance_analysis_enabled: rule.significance_analysis?.enabled !== false,
        significance_sensitivity: rule.significance_analysis?.sensitivity || 'balanced',
        significance_require_technical: rule.significance_analysis?.require_technical_changes || false,
        significance_require_business: rule.significance_analysis?.require_business_changes || false,
        significance_minimum_confidence: rule.significance_analysis?.minimum_confidence || 'medium',
        auto_publish_max_changes: rule.auto_publish_max_changes?.toString() ?? '50',
        auto_publish_max_change_percentage: rule.auto_publish_max_change_percentage?.toString() ?? '5',
        auto_publish_target_provider: rule?.auto_publish_target?.provider ?? '',
        auto_publish_target_connection_id: rule?.auto_publish_target?.connection_id ?? '',
        auto_publish_target_resource_id: rule?.auto_publish_target?.resource_id ?? '',
        auto_publish_custom_resource: ''
      });
    });
  }

  const scheduleTypeOptions = [
    { value: 'minutes', label: 'Minutes' },
    { value: 'hours', label: 'Hours' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'custom', label: 'Custom schedule' }
  ];

  const scheduleDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  const dayToCron: Record<string, string> = {
    sunday: '0', monday: '1', tuesday: '2', wednesday: '3',
    thursday: '4', friday: '5', saturday: '6'
  };

  function parseHourMinute(value: string): { hour: number; minute: number } | null {
    const parts = value.split(':').map((segment) => segment.trim());
    if (parts.length !== 2) return null;
    const hour = Number(parts[0]);
    const minute = Number(parts[1]);
    if (Number.isNaN(hour) || Number.isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return { hour, minute };
  }

  function convertNaturalLanguageToCron(description: string): string | null {
    const cleaned = description.trim().toLowerCase();
    if (!cleaned) return null;

    const everyMinutesMatch = cleaned.match(/^every\s+(\d+)\s+minutes?$/);
    if (everyMinutesMatch) {
      const minutes = Number(everyMinutesMatch[1]);
      if (minutes >= 1 && minutes <= 59) return `*/${minutes} * * * *`;
    }

    if (cleaned === 'every hour' || cleaned === 'hourly') return '0 * * * *';

    const everyHoursMatch = cleaned.match(/^every\s+(\d+)\s+hours?$/);
    if (everyHoursMatch) {
      const hours = Number(everyHoursMatch[1]);
      if (hours >= 1 && hours <= 24) return `0 */${hours} * * *`;
    }

    const dailyMatch = cleaned.match(/^every\s+(\d+)\s+days?(?:\s+at\s+(\d{1,2}:\d{2}))?$/);
    if (dailyMatch) {
      const interval = Number(dailyMatch[1]);
      const time = dailyMatch[2] || '00:00';
      const parsed = parseHourMinute(time);
      if (parsed) {
        if (interval > 1) return `cron:${parsed.minute} ${parsed.hour} */${interval} * *`;
        return `${parsed.minute} ${parsed.hour} * * *`;
      }
    }

    const weeklyMatch = cleaned.match(/^weekly\s+on\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s+at\s+(\d{1,2}:\d{2}))?$/);
    if (weeklyMatch) {
      const dayName = weeklyMatch[1];
      const time = weeklyMatch[2] || '00:00';
      const parsed = parseHourMinute(time);
      if (parsed) {
        const dayValue = dayToCron[dayName] ?? '0';
        return `${parsed.minute} ${parsed.hour} * * ${dayValue}`;
      }
    }

    const monthlyMatch = cleaned.match(/^monthly(?:\s+on\s+(\d{1,2}))(?:\s+at\s+(\d{1,2}:\d{2}))?$/);
    if (monthlyMatch) {
      const dayOfMonth = Math.min(Math.max(Number(monthlyMatch[1]), 1), 28);
      const time = monthlyMatch[2] || '00:00';
      const parsed = parseHourMinute(time);
      if (parsed) return `${parsed.minute} ${parsed.hour} ${dayOfMonth} * *`;
    }

    const cronMatch = cleaned.match(/^cron:(.+)$/i);
    if (cronMatch && cronMatch[1].trim()) return cronMatch[1].trim();

    const tokens = cleaned.split(/\s+/).filter(Boolean);
    if (tokens.length === 5) return tokens.join(' ');

    return null;
  }

  function handleCustomScheduleDescriptionChange(description: string) {
    if (!singleRuleForm) return;
    updateSingleRuleField('customScheduleDescription', description);
    if (!description.trim()) {
      updateSingleRuleField('customCron', '');
      return;
    }
    const parsedCron = convertNaturalLanguageToCron(description);
    if (parsedCron) {
      updateSingleRuleField('customCron', parsedCron);
    }
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

  function buildScheduleValue(form: AutomationRuleForm) {
    const [hour = '2', minute = '00'] = form.scheduleTime.split(':');
    const cronHour = parseInt(hour, 10);
    const cronMinute = parseInt(minute, 10);
    switch (form.scheduleType) {
      case 'minutes': {
        const value = Math.max(1, Number(form.scheduleIntervalValue) || 1);
        return `interval:${value}m`;
      }
      case 'hours': {
        const value = Math.max(1, Number(form.scheduleIntervalValue) || 1);
        return `interval:${value}h`;
      }
      case 'daily': {
        const intervalDays = Math.max(1, Number(form.scheduleIntervalValue) || 1);
        if (intervalDays > 1) return `interval:${intervalDays}d`;
        return `cron:${Math.max(0, cronMinute)} ${Math.min(23, cronHour)} * * *`;
      }
      case 'weekly': {
        const day = dayToCron[form.scheduleDay.toLowerCase()] ?? '1';
        return `cron:${Math.max(0, cronMinute)} ${Math.min(23, cronHour)} * * ${day}`;
      }
      case 'monthly': {
        const dayOfMonth = Math.min(Math.max(Number(form.scheduleMonthDay) || 1, 1), 28);
        return `cron:${Math.max(0, cronMinute)} ${Math.min(23, cronHour)} ${dayOfMonth} * *`;
      }
      case 'custom':
        return form.customCron.trim() ? `cron:${form.customCron.trim()}` : 'every_night';
      default:
        return 'every_night';
    }
  }

  function formToRule(form: AutomationRuleForm) {
    const rule: Record<string, any> = {
      id: form.id,
      enabled: form.enabled,
      schedule: buildScheduleValue(form),
      detect_changes: form.detect_changes,
      generate_doc: form.generate_doc,
      generate_diagram: form.generate_diagram,
      auto_publish: form.auto_publish,
      auto_publish_new_docs: form.auto_publish_new_docs,
      auto_publish_max_changes: Number(form.auto_publish_max_changes) || 0,
      auto_publish_max_change_percentage: Number(form.auto_publish_max_change_percentage) || 0
    };

    if (form.name.trim()) rule.name = form.name.trim();
    if (form.customScheduleDescription.trim()) rule.custom_schedule_description = form.customScheduleDescription.trim();

    const provider = form.auto_publish_target_provider.trim();
    const connectionId = form.auto_publish_target_connection_id.trim();
    const resourceId = form.auto_publish_target_resource_id.trim() || form.auto_publish_custom_resource.trim();

    if (provider || connectionId || resourceId) {
      rule.auto_publish_target = {
        ...(provider && { provider }),
        ...(connectionId && { connection_id: connectionId }),
        ...(resourceId && { resource_id: resourceId })
      };
    }

    rule.significance_analysis = {
      enabled: form.significance_analysis_enabled,
      sensitivity: form.significance_sensitivity,
      require_technical_changes: form.significance_require_technical,
      require_business_changes: form.significance_require_business,
      minimum_confidence: form.significance_minimum_confidence
    };

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
      setAutomationCache((prev) => ({ ...prev, [repoId]: data }));
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
      setAutomationCache((prev) => ({ ...prev, [repoId]: updated }));
      const nextForms = mapRulesToForms(updated.automation_rules || []);
      setSingleRuleForm(nextForms.length > 0 ? nextForms[0] : createAutomationRuleForm());
      setAutomationAlerts((prev) => ({ ...prev, [repoId]: { type: 'success', message: 'Automation rule saved' } }));
      
      // Close the modal after successful save
      setAutomationConfigOpen(false);
      setActiveAutomationRepoId(null);
    } catch (error: any) {
      setAutomationAlerts((prev) => ({ ...prev, [repoId]: { type: 'error', message: error?.message || 'Failed to save automation rule' } }));
    } finally {
      setAutomationSaving((prev) => ({ ...prev, [repoId]: false }));
    }
  }


  async function openAutomationModal(repoId: string) {
    setActiveAutomationRepoId(repoId);
    setAutomationConfigOpen(true);
    // Load existing rule or create new one
    await fetchAutomationRules(repoId);
  }

  function closeAutomationModal() {
    setActiveAutomationRepoId(null);
    setAutomationConfigOpen(false);
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

  // Group rules by repo for better organization
  const rulesByRepo = reposList.reduce((acc, repo) => {
    const repoRules = allRules.filter((r) => r.repoId === repo.id);
    if (repoRules.length > 0) acc[repo.id] = { repo, rules: repoRules };
    return acc;
  }, {} as Record<string, { repo: Repo; rules: typeof allRules }>);

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

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-white/10">
        <nav className="flex gap-1" aria-label="Automation tabs">
          <button
            onClick={() => setActiveTab('repos')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'repos'
                ? 'border-purple-500 text-white'
                : 'border-transparent text-white/60 hover:text-white hover:border-white/20'
            }`}
          >
            <Github className="h-4 w-4" />
            Repositories
          </button>
          <button
            onClick={() => setActiveTab('runs')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'runs'
                ? 'border-purple-500 text-white'
                : 'border-transparent text-white/60 hover:text-white hover:border-white/20'
            }`}
          >
            <PlayCircle className="h-4 w-4" />
            Runs
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'rules'
                ? 'border-purple-500 text-white'
                : 'border-transparent text-white/60 hover:text-white hover:border-white/20'
            }`}
          >
            <Zap className="h-4 w-4" />
            Rules
          </button>
        </nav>
      </div>

      {/* Success/Error Messages */}
      {repoSuccess && (
        <div className="mb-6 rounded-lg border border-green-500/50 bg-green-500/10 p-4 text-green-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              <p>{repoSuccess}</p>
            </div>
            <button
              onClick={() => setRepoSuccess('')}
              className="text-green-200/60 hover:text-green-200"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {repoError && (
        <div className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              <p>{repoError}</p>
            </div>
            <button
              onClick={() => setRepoError('')}
              className="text-red-200/60 hover:text-red-200"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'repos' && (
        <>
          {/* Repository Management Section */}
          <div className="glass-panel p-6 mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-white mb-2">Repositories</h2>
            <p className="text-white/70">Manage your repositories and configure automation rules</p>
          </div>
          <button
            onClick={() => {
              if (showAddForm) {
                setFormName('');
                setFormRepoUrl('');
                setFormBranch('main');
                setFormSubdir('');
                setOwnerInput('');
                setBaseOwner('');
                setShowRepoSelector(false);
                setAvailableRepos([]);
                setBranches([]);
                setDirectories([]);
                setRepoError('');
                setRepoSuccess('');
              }
              setShowAddForm(!showAddForm);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            {showAddForm ? 'Cancel' : 'Add Repository'}
          </button>
        </div>

        {/* Add Repository Form */}
        {showAddForm && (
          <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Add New Repository</h3>
            
            {/* Repository Search */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-white/90 mb-2">
                Search by GitHub Username or Organization
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={ownerInput}
                  onChange={(e) => setOwnerInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      searchRepos();
                    }
                  }}
                  placeholder="Enter GitHub username or org (e.g., 'vercel' or 'github.com/vercel')"
                  className="flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40"
                />
                <button
                  type="button"
                  onClick={searchRepos}
                  disabled={loadingRepoSearch || !ownerInput.trim()}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 transition-all hover:bg-white/20 hover:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingRepoSearch ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  Search
                </button>
              </div>
              {showRepoSelector && availableRepos.length > 0 && (
                <div className="mt-2 rounded-lg border border-white/20 bg-black/95 max-h-60 overflow-y-auto">
                  {availableRepos.map((repo) => (
                    <button
                      key={repo.url}
                      type="button"
                      onClick={() => handleRepoSelect(repo)}
                      className="w-full text-left px-3 py-2 hover:bg-white/10 transition-colors border-b border-white/10 last:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        <Github className="h-4 w-4 text-white/60" />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-white">{repo.name}</div>
                          <div className="text-xs text-white/50">{repo.full_name}</div>
                        </div>
                        {repo.private && (
                          <span className="text-xs text-white/40 bg-white/10 px-2 py-0.5 rounded">Private</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Display Name */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-white/90 mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="My Project"
                className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40"
              />
            </div>

            {/* Repository URL */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-white/90 mb-1">
                Repository URL
              </label>
              <input
                type="text"
                value={formRepoUrl}
                onChange={(e) => setFormRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40"
              />
            </div>

            {/* Branch and Subdirectory */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-white/90 mb-1">
                  Default Branch
                </label>
                {branches.length > 0 ? (
                  <div className="relative">
                    <select
                      value={formBranch}
                      onChange={(e) => setFormBranch(e.target.value)}
                      disabled={loadingBranches}
                      className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white outline-none focus:border-white/40 disabled:opacity-50 appearance-none pr-8"
                    >
                      {branches.map((b) => (
                        <option key={b} value={b} className="bg-black text-white">
                          {b}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60 pointer-events-none" />
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={formBranch}
                      onChange={(e) => setFormBranch(e.target.value)}
                      placeholder="main"
                      disabled={loadingBranches}
                      className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40 disabled:opacity-50"
                    />
                    {loadingBranches && (
                      <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-white/60" />
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-white/90 mb-1">
                  Subdirectory (optional)
                </label>
                {directories.length > 0 ? (
                  <div className="relative">
                    <select
                      value={formSubdir}
                      onChange={(e) => setFormSubdir(e.target.value)}
                      disabled={loadingDirectories}
                      className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white outline-none focus:border-white/40 disabled:opacity-50 appearance-none pr-8"
                    >
                      <option value="" className="bg-black text-white">None (root)</option>
                      {directories.map((d) => (
                        <option key={d} value={d} className="bg-black text-white">
                          {d}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60 pointer-events-none" />
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={formSubdir}
                      onChange={(e) => setFormSubdir(e.target.value)}
                      placeholder="/src (optional)"
                      disabled={loadingDirectories}
                      className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40 disabled:opacity-50"
                    />
                    {loadingDirectories && (
                      <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-white/60" />
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleAddRepo}
                disabled={formSubmitting || !formName || !formRepoUrl}
                className="inline-flex items-center gap-2 rounded-lg bg-green-500/20 border border-green-500/40 px-4 py-2 text-sm font-medium text-green-200 transition-all hover:bg-green-500/30 hover:border-green-500/60 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {formSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Add Repository
                  </>
                )}
              </button>
            </div>
          </div>
        )}

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
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
            >
              Add your first repository
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-white/10 bg-white/5">
                <tr>
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
                  return (
                    <tr key={repo.id} className="hover:bg-white/5 transition-colors">
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
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/20 px-2 py-1 text-xs text-purple-300">
                              <Zap className="h-3 w-3" />
                              {activeRules} active
                            </span>
                            <span className="text-xs text-white/50">
                              ({repoRules.length} total)
                            </span>
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
                          <Link
                            href={`/edit`}
                            onClick={(e) => {
                              sessionStorage.setItem('edit-repo-filter', repo.repo_url);
                            }}
                            className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white/90 transition-all hover:bg-white/20 hover:border-white/30"
                            title="View docs for this repository"
                          >
                            <FileText className="h-3 w-3" />
                            View Docs
                          </Link>
                            <button
                              onClick={() => openAutomationModal(repo.id)}
                              className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white/80 transition-all hover:bg-white/20 hover:border-white/30"
                              title="Configure automation rules"
                            >
                              <Zap className="h-3 w-3" />
                              {hasRules ? 'Manage' : 'Setup'}
                            </button>
                            <button
                              onClick={() => setDeleteRepoModal({ open: true, repoId: repo.id, repoName: repo.name })}
                              className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-300 transition-all hover:bg-red-500/20 hover:border-red-500/40"
                              title="Delete repository"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          {repoInfo && (
                            <a
                              href={repo.repo_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white/90 transition-all hover:bg-white/20 hover:border-white/30"
                              title="Open repository on GitHub"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
        </>
      )}

      {activeTab === 'runs' && (
        <div className="space-y-6">
          <div className="glass-panel p-6">
            <h2 className="text-2xl font-semibold text-white mb-4">Automation Runs</h2>
            <p className="text-white/70 mb-6">View all automation rule executions across your repositories</p>
            
            {reposList.length === 0 ? (
              <div className="text-center py-12">
                <PlayCircle className="h-16 w-16 text-white/30 mx-auto mb-4" />
                <p className="text-white/60 mb-2">No repositories configured yet</p>
                <button
                  onClick={() => setActiveTab('repos')}
                  className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
                >
                  Add a repository
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {reposList.map((repo) => {
                  const repoMetadata = repo.settings?.automation_metadata || {};
                  const repoRules = allRules.filter((r) => r.repoId === repo.id);
                  
                  if (repoRules.length === 0) return null;

                  return (
                    <div key={repo.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                      <div className="flex items-center gap-2 mb-4">
                        <Github className="h-4 w-4 text-white/60" />
                        <div>
                          <h3 className="text-lg font-semibold text-white">{repo.name}</h3>
                          <p className="text-xs text-white/50 flex items-center gap-1">
                            <GitBranch className="h-3 w-3" />
                            {repo.default_branch}
                          </p>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        {repoRules.map((rule) => {
                          const ruleMetadata = repoMetadata[rule.ruleId] || {};
                          const executionHistory = ruleMetadata.execution_history || [];
                          
                          if (executionHistory.length === 0) {
                            return (
                              <div key={rule.ruleId} className="rounded-lg border border-white/10 bg-black/40 p-3">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-sm font-medium text-white">{rule.ruleName}</p>
                                    <p className="text-xs text-white/50">No runs yet</p>
                                  </div>
                                  <Clock className="h-4 w-4 text-white/40" />
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div key={rule.ruleId} className="space-y-2">
                              <p className="text-sm font-medium text-white/90">{rule.ruleName}</p>
                              <div className="space-y-2 max-h-60 overflow-y-auto">
                                {executionHistory.map((execution: any, idx: number) => {
                                  const hasErrors = execution.errors && execution.errors.length > 0;
                                  const errorKey = `${repo.id}-${rule.ruleId}-${idx}`;
                                  const showErrors = expandedErrors[errorKey] || false;
                                  
                                  // Check if this was a cancelled run
                                  const isCancelled = !execution.success && !execution.skipped && 
                                    execution.errors?.some((e: string) => e.toLowerCase().includes('cancelled'));
                                  
                                  return (
                                    <div
                                      key={idx}
                                      className="rounded-lg border border-white/10 bg-black/40 p-3"
                                    >
                                      <div className="flex items-start gap-3">
                                        <div className={`mt-0.5 ${
                                          execution.success ? 'text-green-400' : 
                                          execution.skipped ? 'text-yellow-400' : 
                                          isCancelled ? 'text-orange-400' :
                                          'text-red-400'
                                        }`}>
                                          {execution.success ? (
                                            <CheckCircle2 className="h-4 w-4" />
                                          ) : execution.skipped ? (
                                            <Clock className="h-4 w-4" />
                                          ) : isCancelled ? (
                                            <StopCircle className="h-4 w-4" />
                                          ) : (
                                            <XCircle className="h-4 w-4" />
                                          )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                                            <span className="text-xs text-white/60">{formatDate(execution.timestamp)}</span>
                                            <span className={`text-xs px-2 py-0.5 rounded ${
                                              execution.success ? 'bg-green-500/20 text-green-300' : 
                                              execution.skipped ? 'bg-yellow-500/20 text-yellow-300' : 
                                              isCancelled ? 'bg-orange-500/20 text-orange-300' :
                                              'bg-red-500/20 text-red-300'
                                            }`}>
                                              {execution.success ? 'Success' : execution.skipped ? 'Skipped' : isCancelled ? 'Cancelled' : 'Failed'}
                                            </span>
                                            <span className={`text-xs px-2 py-0.5 rounded ${
                                              execution.trigger === 'manual' 
                                                ? 'bg-purple-500/20 text-purple-300' 
                                                : 'bg-blue-500/20 text-blue-300'
                                            }`}>
                                              {execution.trigger === 'manual' ? 'Manual' : 'Scheduled'}
                                            </span>
                                          </div>
                                          {execution.actions && execution.actions.length > 0 && (
                                            <p className="text-xs text-white/50 mb-1">Actions: {execution.actions.join(', ')}</p>
                                          )}
                                          {execution.skip_reason && (
                                            <p className="text-xs text-yellow-300 mb-1">Reason: {execution.skip_reason}</p>
                                          )}
                                          {hasErrors && (
                                            <button
                                              onClick={() => setExpandedErrors(prev => ({ ...prev, [errorKey]: !showErrors }))}
                                              className="flex items-center gap-1 text-xs text-red-300 hover:text-red-200 mt-1"
                                            >
                                              <ChevronDown className={`h-3 w-3 transition-transform ${showErrors ? 'rotate-180' : ''}`} />
                                              {showErrors ? 'Hide' : 'Show'} Errors ({execution.errors.length})
                                            </button>
                                          )}
                                          {hasErrors && showErrors && (
                                            <div className="mt-2 pl-4 border-l-2 border-red-500/30">
                                              <ul className="list-disc list-inside text-xs text-red-200 space-y-1">
                                                {execution.errors.map((error: string, errorIdx: number) => (
                                                  <li key={errorIdx}>{error}</li>
                                                ))}
                                              </ul>
                                            </div>
                                          )}
                                          <div className="flex items-center gap-3 mt-2">
                                            {execution.doc_id && (
                                              <Link
                                                href={`/edit/${execution.doc_id}`}
                                                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                                              >
                                                <FileText className="h-3 w-3" />
                                                View Document
                                              </Link>
                                            )}
                                            {execution.diagram_id && (
                                              <Link
                                                href={`/architecture/${execution.diagram_id}`}
                                                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                                              >
                                                <LinkIcon className="h-3 w-3" />
                                                View Diagram
                                              </Link>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'rules' && (
        <div className="space-y-6">
          <div className="glass-panel p-6">
            <h2 className="text-2xl font-semibold text-white mb-4">Automation Rules</h2>
            <p className="text-white/70 mb-6">View and manage automation rules configured for your repositories</p>
            
            {reposList.length === 0 ? (
              <div className="text-center py-12">
                <Zap className="h-16 w-16 text-white/30 mx-auto mb-4" />
                <p className="text-white/60 mb-2">No repositories configured yet</p>
                <button
                  onClick={() => setActiveTab('repos')}
                  className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
                >
                  Add a repository
                </button>
              </div>
            ) : Object.keys(rulesByRepo).length === 0 ? (
              <div className="text-center py-12">
                <Zap className="h-16 w-16 text-white/30 mx-auto mb-4" />
                <p className="text-white/60 mb-2">No automation rules configured yet</p>
                <p className="text-sm text-white/40 mb-4">Add automation rules to your repositories to get started</p>
                <button
                  onClick={() => setActiveTab('repos')}
                  className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
                >
                  Configure Rules
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(rulesByRepo).map(([repoId, { repo, rules }]) => {
                  const repoMetadata = repo.settings?.automation_metadata || {};
                  return (
                    <div key={repoId} className="rounded-lg border border-white/10 bg-white/5 p-6">
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
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openAutomationModal(repoId)}
                            className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
                          >
                            <Plus className="h-4 w-4" />
                            Add Rule
                          </button>
                          <button
                            onClick={() => setDeleteRepoModal({ open: true, repoId, repoName: repo.name })}
                            className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/20"
                            title="Delete repository"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Single Rule Tile - Clickable to Configure */}
                      {rules.length > 0 ? (
                        (() => {
                          const rule = rules[0]; // Only show first rule (one rule per repo)
                          const ruleMetadata = repoMetadata[rule.ruleId] || {};
                          const lastExecution = ruleMetadata.last_execution;
                          const settings = repo.settings || {};
                          const ruleConfig = (settings.automation_rules || []).find((r: any) => (r.id || r.name) === rule.ruleId);

                          return (
                            <div 
                              onClick={() => openAutomationModal(repoId)}
                              className="rounded-lg border border-white/10 bg-black/40 p-4 cursor-pointer hover:bg-black/60 transition-colors"
                            >
                              <div className="flex items-start justify-between gap-3 mb-3">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-white truncate">{rule.ruleName || 'Untitled Rule'}</p>
                                  <div className="mt-2 space-y-1">
                                    {ruleConfig?.schedule && (
                                      <p className="text-xs text-white/60">Schedule: {ruleConfig.schedule}</p>
                                    )}
                                    <div className="flex items-center gap-2">
                                      <span className={`text-xs px-2 py-0.5 rounded ${rule.enabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/60'}`}>
                                        {rule.enabled ? 'Enabled' : 'Disabled'}
                                      </span>
                                      {lastExecution && (
                                        <span className={`text-xs px-2 py-0.5 rounded ${getStatusColor(rule.lastRunStatus)}`}>
                                          {rule.lastRunStatus || 'Never run'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className={`rounded-full p-2 ${getStatusColor(rule.lastRunStatus)}`}>
                                  {getStatusIconComponent(rule.lastRunStatus)}
                                </div>
                              </div>

                              <div className="space-y-2 mt-3 pt-3 border-t border-white/10">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-white/60">Actions:</span>
                                  <div className="flex flex-wrap gap-1">
                                    {ruleConfig?.detect_changes && (
                                      <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-xs">Detect Changes</span>
                                    )}
                                    {ruleConfig?.generate_doc && (
                                      <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-xs">Generate Doc</span>
                                    )}
                                    {ruleConfig?.generate_diagram && (
                                      <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-xs">Generate Diagram</span>
                                    )}
                                    {ruleConfig?.auto_publish && (
                                      <span className="px-1.5 py-0.5 rounded bg-green-500/20 text-green-300 text-xs">Auto Publish</span>
                                    )}
                                  </div>
                                </div>

                                {lastExecution && (
                                  <div className="space-y-1 mt-2">
                                    <div className="flex items-center gap-2 text-xs">
                                      {getStatusIcon(lastExecution.success ? (lastExecution.skipped ? 'skipped' : 'success') : 'failed')}
                                      <span className="text-white/60">Last run: {formatDate(lastExecution.timestamp)}</span>
                                    </div>
                                    {lastExecution.actions && lastExecution.actions.length > 0 && (
                                      <p className="text-xs text-white/50">Actions: {lastExecution.actions.join(', ')}</p>
                                    )}
                                    {lastExecution.doc_id && (
                                      <Link
                                        href={`/edit/${lastExecution.doc_id}`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                                      >
                                        <FileText className="h-3 w-3" />
                                        View Document
                                      </Link>
                                    )}
                                  </div>
                                )}

                                {/* Run result feedback */}
                                {runResults[`${repoId}-${rule.ruleId}`] && (
                                  <div className={`mt-2 p-2 rounded text-xs ${
                                    runResults[`${repoId}-${rule.ruleId}`]?.success 
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  }`}>
                                    {runResults[`${repoId}-${rule.ruleId}`]?.message}
                                    {runResults[`${repoId}-${rule.ruleId}`]?.docId && (
                                      <Link
                                        href={`/edit/${runResults[`${repoId}-${rule.ruleId}`]?.docId}`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="ml-2 underline hover:no-underline"
                                      >
                                        View Doc →
                                      </Link>
                                    )}
                                  </div>
                                )}

                                <div className="flex items-center gap-2 mt-3">
                                  {runningRules[`${repoId}-${rule.ruleId}`] ? (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleCancelRule(repoId, rule.ruleId);
                                      }}
                                      className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition-colors"
                                      title="Cancel running rule"
                                    >
                                      <StopCircle className="h-3 w-3" />
                                      Cancel
                                    </button>
                                  ) : (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRunRule(repoId, rule.ruleId);
                                      }}
                                      className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 px-2 py-1 rounded border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 transition-colors"
                                      title="Run rule now"
                                    >
                                      <PlayCircle className="h-3 w-3" />
                                      Run Now
                                    </button>
                                  )}
                                  {runningRules[`${repoId}-${rule.ruleId}`] && (
                                    <span className="flex items-center gap-1 text-xs text-white/60">
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                      Running...
                                    </span>
                                  )}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteRuleModal({ open: true, repoId, ruleId: rule.ruleId, ruleName: rule.ruleName });
                                    }}
                                    className="text-xs text-red-400 hover:text-red-300 px-2"
                                    title="Delete rule"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                  <p className="flex-1 text-xs text-white/50 text-right">Click to configure →</p>
                                </div>
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        <div 
                          onClick={() => openAutomationModal(repoId)}
                          className="rounded-lg border-2 border-dashed border-white/20 bg-white/5 p-8 text-center cursor-pointer hover:bg-white/10 transition-colors"
                        >
                          <Plus className="h-8 w-8 text-white/40 mx-auto mb-2" />
                          <p className="text-sm text-white/60 mb-1">No automation rule configured</p>
                          <p className="text-xs text-white/40">Click to add a rule</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}


      {/* Delete Repository Confirmation Modal */}
      {deleteRepoModal.open && deleteRepoModal.repoId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => !deleting && setDeleteRepoModal({ open: false, repoId: null, repoName: '' })}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !deleting) setDeleteRepoModal({ open: false, repoId: null, repoName: '' });
          }}
        >
          <div
            className="w-full max-w-md rounded-xl border border-white/20 bg-black/90 p-6 shadow-xl backdrop-blur-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-xl font-semibold text-white">Delete Repository</h2>
            <p className="mb-6 text-white/70">
              Are you sure you want to delete <span className="font-semibold text-white">{deleteRepoModal.repoName}</span>? This will also remove all associated automation rules. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                className="rounded-lg border border-white/20 px-4 py-2 text-white/80 hover:bg-white/10 disabled:opacity-50"
                onClick={() => setDeleteRepoModal({ open: false, repoId: null, repoName: '' })}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                onClick={() => deleteRepoModal.repoId && handleDeleteRepo(deleteRepoModal.repoId)}
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
                            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition ${
                              singleRuleForm.enabled
                                ? 'border-emerald-500 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                                : 'border-white/30 text-white/60 hover:border-white/50 hover:text-white'
                            }`}
                          >
                            {singleRuleForm.enabled ? 'Enabled' : 'Disabled'}
                          </button>
                          <p className="text-xs text-white/60">When off, the rule is ignored.</p>
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
                        <label className="text-sm text-white/80">
                          Schedule
                          <select
                            value={singleRuleForm.scheduleType}
                            onChange={(event) => updateSingleRuleField('scheduleType', event.target.value as AutomationRuleForm['scheduleType'])}
                            className="mt-1 w-full rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                          >
                            {scheduleTypeOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      {/* Schedule configuration fields */}
                      {singleRuleForm.scheduleType === 'minutes' && (
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="text-sm text-white/80">
                            Every
                            <input
                              type="number"
                              min="1"
                              value={singleRuleForm.scheduleIntervalValue}
                              onChange={(event) => updateSingleRuleField('scheduleIntervalValue', event.target.value)}
                              className="mt-1 rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                            />
                          </label>
                          <div className="text-sm text-white/70 flex items-center">minutes (interval-based)</div>
                        </div>
                      )}

                      {singleRuleForm.scheduleType === 'hours' && (
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="text-sm text-white/80">
                            Every
                            <input
                              type="number"
                              min="1"
                              value={singleRuleForm.scheduleIntervalValue}
                              onChange={(event) => updateSingleRuleField('scheduleIntervalValue', event.target.value)}
                              className="mt-1 rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                            />
                          </label>
                          <div className="text-sm text-white/70 flex items-center">hours (interval-based)</div>
                        </div>
                      )}

                      {singleRuleForm.scheduleType === 'daily' && (
                        <div className="grid gap-3 md:grid-cols-3">
                          <label className="text-sm text-white/80">
                            Every
                            <input
                              type="number"
                              min="1"
                              value={singleRuleForm.scheduleIntervalValue}
                              onChange={(event) => updateSingleRuleField('scheduleIntervalValue', event.target.value)}
                              className="mt-1 rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                            />
                          </label>
                          <label className="text-sm text-white/80">
                            Interval
                            <div className="text-xs text-white/60 mt-1">day(s)</div>
                          </label>
                          <label className="text-sm text-white/80">
                            Time (UTC)
                            <input
                              type="time"
                              value={singleRuleForm.scheduleTime}
                              onChange={(event) => updateSingleRuleField('scheduleTime', event.target.value)}
                              className="mt-1 w-full rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                            />
                          </label>
                        </div>
                      )}

                      {singleRuleForm.scheduleType === 'weekly' && (
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="text-sm text-white/80">
                            Weekly day
                            <select
                              value={singleRuleForm.scheduleDay}
                              onChange={(event) => updateSingleRuleField('scheduleDay', event.target.value)}
                              className="mt-1 w-full rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                            >
                              {scheduleDays.map((day) => (
                                <option key={day} value={day}>
                                  {day.charAt(0).toUpperCase() + day.slice(1)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-sm text-white/80">
                            Time (UTC)
                            <input
                              type="time"
                              value={singleRuleForm.scheduleTime}
                              onChange={(event) => updateSingleRuleField('scheduleTime', event.target.value)}
                              className="mt-1 w-full rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                            />
                          </label>
                        </div>
                      )}

                      {singleRuleForm.scheduleType === 'monthly' && (
                        <div className="grid gap-3 md:grid-cols-3">
                          <label className="text-sm text-white/80">
                            Day of month
                            <input
                              type="number"
                              min="1"
                              max="28"
                              value={singleRuleForm.scheduleMonthDay}
                              onChange={(event) => updateSingleRuleField('scheduleMonthDay', event.target.value)}
                              className="mt-1 rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                            />
                          </label>
                          <label className="text-sm text-white/80">
                            Time (UTC)
                            <input
                              type="time"
                              value={singleRuleForm.scheduleTime}
                              onChange={(event) => updateSingleRuleField('scheduleTime', event.target.value)}
                              className="mt-1 w-full rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                            />
                          </label>
                        </div>
                      )}

                      {singleRuleForm.scheduleType === 'custom' && (
                        <div className="grid gap-3">
                          <label className="text-sm text-white/80">
                            Custom schedule
                            <input
                              type="text"
                              value={singleRuleForm.customScheduleDescription}
                              onChange={(event) => handleCustomScheduleDescriptionChange(event.target.value)}
                              placeholder='e.g., "Weekly on Monday at 07:00" or "Every 10 minutes"'
                              className="mt-1 w-full rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                            />
                            <p className="text-xs text-white/50 mt-1">
                              {singleRuleForm.customCron
                                ? `Cron expression: ${singleRuleForm.customCron}`
                                : 'Describe the cadence in plain language; we convert it behind the scenes.'}
                            </p>
                          </label>
                        </div>
                      )}

                      <div className="grid gap-3 lg:grid-cols-3">
                        {[
                          { field: 'detect_changes', label: 'Detect changes', helper: 'Only run when the repo has new commits.' },
                          { field: 'generate_doc', label: 'Generate documentation', helper: 'Produce a doc if changes are found.' }
                        ].map(({ field, label, helper }) => (
                          <label key={field} className="flex flex-col gap-1 text-sm text-white/80">
                            <span className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={singleRuleForm[field as keyof AutomationRuleForm] as boolean}
                                onChange={(event) => updateSingleRuleField(field as keyof AutomationRuleForm, event.target.checked)}
                                className="h-4 w-4 rounded border-white/30 bg-black/60 text-blue-500 focus:ring-0"
                              />
                              {label}
                            </span>
                            <span className="text-xs text-white/60">{helper}</span>
                          </label>
                        ))}
                      </div>

                      <div className="grid gap-3 lg:grid-cols-3">
                        {[
                          { field: 'generate_diagram', label: 'Generate diagram', helper: 'Include architecture diagrams.' },
                          { field: 'auto_publish', label: 'Auto-publish', helper: 'Approve docs automatically when thresholds pass.' },
                          {
                            field: 'auto_publish_new_docs',
                            label: 'Auto-publish new docs',
                            helper: 'Publish brand-new documents immediately.'
                          }
                        ].map(({ field, label, helper }) => (
                          <label key={field} className="flex flex-col gap-1 text-sm text-white/80">
                            <span className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={singleRuleForm[field as keyof AutomationRuleForm] as boolean}
                                onChange={(event) => updateSingleRuleField(field as keyof AutomationRuleForm, event.target.checked)}
                                className="h-4 w-4 rounded border-white/30 bg-black/60 text-blue-500 focus:ring-0"
                              />
                              {label}
                            </span>
                            <span className="text-xs text-white/60">{helper}</span>
                          </label>
                        ))}
                      </div>

                      {/* Smart Change Detection - simplified */}
                      {singleRuleForm.detect_changes && (
                        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                          <label className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={singleRuleForm.significance_analysis_enabled}
                              onChange={(event) => updateSingleRuleField('significance_analysis_enabled', event.target.checked)}
                              className="mt-1 h-4 w-4 rounded border-white/30 bg-black/60 text-blue-500 focus:ring-0"
                            />
                            <div className="flex-1">
                              <span className="text-sm font-medium text-white">Smart change detection</span>
                              <p className="text-xs text-white/60 mt-0.5">
                                Skip regeneration when changes are trivial (comments, formatting, etc.)
                              </p>
                              {singleRuleForm.significance_analysis_enabled && (
                                <select
                                  value={singleRuleForm.significance_sensitivity}
                                  onChange={(event) => updateSingleRuleField('significance_sensitivity', event.target.value as 'strict' | 'balanced' | 'lenient')}
                                  className="mt-2 w-full rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                                >
                                  <option value="lenient">Lenient — Only skip trivial changes (comments, whitespace)</option>
                                  <option value="balanced">Balanced — Skip minor refactors too (recommended)</option>
                                  <option value="strict">Strict — Only regenerate for API/behavior changes</option>
                                </select>
                              )}
                            </div>
                          </label>
                        </div>
                      )}

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
                        className={`mt-2 text-sm ${
                          automationAlerts[activeAutomationRepoId]?.type === 'error' ? 'text-red-300' : 'text-emerald-300'
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
