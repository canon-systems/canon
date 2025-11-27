'use client';

import { useState, useEffect, useRef } from 'react';
import type { MouseEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Settings, User, Link2, Sliders, Mail, Check, X, Loader2, Github, GitBranch, Plus, ExternalLink, FileText, Search, ChevronDown, Trash2, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { IntegrationLogos } from '@/components/IntegrationLogos';
import Nango from '@nangohq/frontend';
import type { User as SupabaseUser } from '@supabase/supabase-js';

interface Connection {
  id: string;
  provider: string;
  connection_id: string;
  status: string;
  metadata: any;
  created_at: string;
  updated_at: string;
}

type TabId = 'profile' | 'integrations' | 'repositories' | 'preferences';

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
}

type AutomationAlert = {
  type: 'success' | 'error';
  message: string;
} | null;

interface SettingsPageClientProps {
  user: SupabaseUser | null;
}

const tabs: Array<{ id: TabId; name: string; icon: any }> = [
  { id: 'profile', name: 'Profile', icon: User },
  { id: 'integrations', name: 'Integrations', icon: Link2 },
  { id: 'repositories', name: 'Repositories', icon: Github },
  { id: 'preferences', name: 'Preferences', icon: Sliders }
];

const KNOWLEDGE_BASE_PROVIDERS = new Set<string>(['notion', 'confluence', 'coda']);

function normalizeProviderName(provider?: string | null) {
  if (!provider) {
    return '';
  }
  return provider.trim().toLowerCase();
}

function isKnowledgeBaseProvider(provider?: string | null) {
  const normalizedProvider = normalizeProviderName(provider);
  return normalizedProvider ? KNOWLEDGE_BASE_PROVIDERS.has(normalizedProvider) : false;
}

export function SettingsPageClient({ user: initialUser }: SettingsPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false);
  const [connectionToDisconnect, setConnectionToDisconnect] = useState<{ connectionId: string; provider: string } | null>(null);
  const [providerResources, setProviderResources] = useState<Record<string, Array<{ id: string; name: string }>>>({});
  const [providerResourceLoading, setProviderResourceLoading] = useState<Record<string, boolean>>({});
  const [providerResourceErrors, setProviderResourceErrors] = useState<Record<string, string>>({});

  // Repository management state
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formRepoUrl, setFormRepoUrl] = useState('');
  const [formBranch, setFormBranch] = useState('main');
  const [formSubdir, setFormSubdir] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Repo detection state
  const [ownerInput, setOwnerInput] = useState('');
  const [baseOwner, setBaseOwner] = useState('');
  const [showRepoSelector, setShowRepoSelector] = useState(false);
  const [availableRepos, setAvailableRepos] = useState<Array<{ name: string; full_name: string; url: string; private: boolean }>>([]);
  const [loadingRepoSearch, setLoadingRepoSearch] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [directories, setDirectories] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingDirectories, setLoadingDirectories] = useState(false);
  const [activeAutomationRepoId, setActiveAutomationRepoId] = useState<string | null>(null);
  const [automationLoading, setAutomationLoading] = useState<Record<string, boolean>>({});
  const [automationSaving, setAutomationSaving] = useState<Record<string, boolean>>({});
  const [automationCache, setAutomationCache] = useState<Record<string, AutomationRulesResponse>>({});
  const [automationRuleForms, setAutomationRuleForms] = useState<Record<string, AutomationRuleForm[]>>({});
  const [automationAlerts, setAutomationAlerts] = useState<Record<string, AutomationAlert>>({});
  const ruleFormRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [automationConfigOpen, setAutomationConfigOpen] = useState(true);
  const [pendingRuleConfiguration, setPendingRuleConfiguration] = useState<{ repoId: string; ruleId: string } | null>(null);

  // Get active tab from URL query param
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const validTabs: TabId[] = ['profile', 'integrations', 'repositories', 'preferences'];
    if (tabParam && validTabs.includes(tabParam as TabId)) {
      setActiveTab(tabParam as TabId);
    }

    // Check for URL params (for OAuth callbacks)
    const successParam = searchParams.get('success');
    const errorParam = searchParams.get('error');
    if (successParam === 'true') {
      const provider = searchParams.get('provider') || 'service';
      setSuccess(`Successfully connected to ${provider}!`);
      // Clean URL but keep tab param
      const tab = searchParams.get('tab') || 'integrations';
      router.replace(`/settings?tab=${tab}`);
      if (tabParam !== 'integrations') {
        setActiveTab('integrations');
      }
    }
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
      const tab = searchParams.get('tab') || 'integrations';
      router.replace(`/settings?tab=${tab}`);
      if (tabParam !== 'integrations') {
        setActiveTab('integrations');
      }
    }

    if (tabParam === 'integrations' || (!tabParam && activeTab === 'integrations')) {
      loadConnections();
    }
    if (tabParam === 'repositories' || (!tabParam && activeTab === 'repositories')) {
      loadRepos();
    }
  }, [searchParams, router]);

  useEffect(() => {
    loadConnections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload connections when switching to integrations tab
  useEffect(() => {
    if (activeTab === 'integrations' && connections.length === 0 && !loading) {
      loadConnections();
    }
  }, [activeTab]);

  // Reload repos when switching to repositories tab
  useEffect(() => {
    if (activeTab === 'repositories' && repos.length === 0 && !loadingRepos) {
      loadRepos();
    }
  }, [activeTab]);

  // React to repo URL changes - fetch branches
  useEffect(() => {
    if (formRepoUrl && formRepoUrl.includes('github.com')) {
      const noProto = formRepoUrl.replace(/^https?:\/\//, '');
      const parts = noProto.split('/').filter(Boolean);
      if (parts.length >= 3) {
        fetchBranches();
      }
    } else {
      setBranches([]);
      setDirectories([]);
      setFormBranch('main');
      setFormSubdir('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formRepoUrl]);

  // React to branch changes - fetch directories
  useEffect(() => {
    if (formBranch && formRepoUrl && formRepoUrl.includes('github.com')) {
      fetchDirectories();
    } else {
      setDirectories([]);
      setFormSubdir('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formBranch, formRepoUrl]);

  useEffect(() => {
    if (activeAutomationRepoId) {
      fetchAutomationRules(activeAutomationRepoId);
      if (connections.length === 0 && !loading) {
        loadConnections();
      }
    }
  }, [activeAutomationRepoId, connections.length, loading]);

  async function loadConnections() {
    setLoading(true);
    try {
      const response = await fetch('/api/integrations/list');
      if (!response.ok) throw new Error('Failed to load connections');
      const data = await response.json();
      setConnections(data.connections || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load connections');
    } finally {
      setLoading(false);
    }
  }

  async function connectToProvider(providerName: string) {
    setConnecting(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/integrations/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: providerName })
      });

      if (!response.ok) {
        const data = await response.json();
        const errorMsg = data.detail || data.error || 'Failed to initiate connection';
        console.error('Connection error details:', data);
        throw new Error(errorMsg);
      }

      const { sessionToken, provider } = await response.json();

      if (!sessionToken) {
        throw new Error('No session token returned');
      }

      // Initialize Nango frontend SDK and open Connect UI
      const nango = new Nango();
      const connect = nango.openConnectUI({
        onEvent: async (event) => {
          if (event.type === 'close') {
            setConnecting(false);
          } else if (event.type === 'connect') {
            const connectionId = event.payload?.connectionId;
            const providerConfigKey = event.payload?.providerConfigKey || provider;

            if (connectionId) {
              try {
                const saveResponse = await fetch('/api/integrations/save', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({
                    connectionId,
                    provider: providerConfigKey
                  })
                });

                if (!saveResponse.ok) {
                  const errorData = await saveResponse.json();
                  console.error('Failed to save connection:', errorData);
                }
              } catch (saveErr) {
                console.error('Error saving connection:', saveErr);
              }
            }

            const providerDisplayName = getProviderDisplayName(providerName);
            setSuccess(`Successfully connected to ${providerDisplayName}!`);
            setConnecting(false);

            await loadConnections();

            setTimeout(() => {
              setSuccess('');
            }, 5000);
          }
        }
      });

      connect.setSessionToken(sessionToken);
    } catch (err: any) {
      setError(err.message || 'Failed to connect');
      console.error('Connection error:', err);
      setConnecting(false);
    }
  }

  function openDisconnectModal(connectionId: string, provider: string) {
    setConnectionToDisconnect({ connectionId, provider });
    setDisconnectModalOpen(true);
  }

  function closeDisconnectModal() {
    setDisconnectModalOpen(false);
    setConnectionToDisconnect(null);
  }

  async function disconnect(connectionId: string, provider: string) {
    try {
      const response = await fetch('/api/integrations/disconnect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ connectionId, provider })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to disconnect');
      }

      setSuccess(`Disconnected from ${getProviderDisplayName(provider)}`);
      await loadConnections();
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect');
    }
  }

  function getProviderDisplayName(provider: string) {
    if (provider === 'googledocs' || provider === 'google-docs') return 'Google Docs';
    if (provider === 'github') return 'GitHub';
    return provider.charAt(0).toUpperCase() + provider.slice(1);
  }

  function getProviderName(provider: string) {
    if (provider === 'googledocs') return 'Google Docs';
    if (provider === 'github') return 'GitHub';
    return provider.charAt(0).toUpperCase() + provider.slice(1);
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function setActiveTabAndUpdateUrl(tabId: TabId) {
    setActiveTab(tabId);
    router.push(`/settings?tab=${tabId}`, { scroll: false });
  }

  // Automation form helpers
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
      auto_publish_max_changes: overrides.auto_publish_max_changes?.toString() ?? '50',
      auto_publish_max_change_percentage: overrides.auto_publish_max_change_percentage?.toString() ?? '5',
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

    if (!raw) {
      return base;
    }

    if (raw.startsWith('cron:')) {
      return {
        ...base,
        scheduleType: 'custom',
        customCron: raw.replace(/^cron:/, '')
      };
    }

    if (raw.startsWith('interval:')) {
      const match = raw.match(/^interval:(\d+)([mhd])$/);
      if (match) {
        const value = match[1] || '1';
        const unit = match[2];
        if (unit === 'm') {
          return { ...base, scheduleType: 'minutes', scheduleIntervalValue: value };
        }
        if (unit === 'h') {
          return { ...base, scheduleType: 'hours', scheduleIntervalValue: value };
        }
        if (unit === 'd') {
          return { ...base, scheduleType: 'daily', scheduleIntervalValue: value };
        }
      }
    }

    if (raw.startsWith('every_')) {
      const day = raw.split('_')[1] || 'monday';
      return { ...base, scheduleType: 'weekly', scheduleDay: day };
    }

    const normalizedType: AutomationRuleForm['scheduleType'] = ['minutes', 'hours', 'daily', 'weekly', 'monthly', 'custom'].includes(
      raw as AutomationRuleForm['scheduleType']
    )
      ? (raw as AutomationRuleForm['scheduleType'])
      : 'daily';

    return { ...base, scheduleType: normalizedType };
  }

  function mapRulesToForms(rules: Record<string, any>[]): AutomationRuleForm[] {
    if (!Array.isArray(rules)) {
      return [];
    }
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
        auto_publish_max_changes: rule.auto_publish_max_changes?.toString() ?? '50',
        auto_publish_max_change_percentage: rule.auto_publish_max_change_percentage?.toString() ?? '5',
        auto_publish_target_provider: rule?.auto_publish_target?.provider ?? '',
        auto_publish_target_resource_id: rule?.auto_publish_target?.resource_id ?? ''
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

  const scheduleDays = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday'
  ];

  const dayToCron: Record<string, string> = {
    sunday: '0',
    monday: '1',
    tuesday: '2',
    wednesday: '3',
    thursday: '4',
    friday: '5',
    saturday: '6'
  };

  function parseHourMinute(value: string): { hour: number; minute: number } | null {
    const parts = value.split(':').map((segment) => segment.trim());
    if (parts.length !== 2) return null;
    const hour = Number(parts[0]);
    const minute = Number(parts[1]);
    if (
      Number.isNaN(hour) ||
      Number.isNaN(minute) ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      return null;
    }
    return { hour, minute };
  }

  function convertNaturalLanguageToCron(description: string): string | null {
    const cleaned = description.trim().toLowerCase();
    if (!cleaned) return null;

    const everyMinutesMatch = cleaned.match(/^every\s+(\d+)\s+minutes?$/);
    if (everyMinutesMatch) {
      const minutes = Number(everyMinutesMatch[1]);
      if (minutes >= 1 && minutes <= 59) {
        return `*/${minutes} * * * *`;
      }
    }

    if (cleaned === 'every hour' || cleaned === 'hourly') {
      return '0 * * * *';
    }

    const everyHoursMatch = cleaned.match(/^every\s+(\d+)\s+hours?$/);
    if (everyHoursMatch) {
      const hours = Number(everyHoursMatch[1]);
      if (hours >= 1 && hours <= 24) {
        return `0 */${hours} * * *`;
      }
    }

    const dailyMatch = cleaned.match(/^every\s+(\d+)\s+days?(?:\s+at\s+(\d{1,2}:\d{2}))?$/);
    if (dailyMatch) {
      const interval = Number(dailyMatch[1]);
      const time = dailyMatch[2] || '00:00';
      const parsed = parseHourMinute(time);
      if (parsed) {
        if (interval > 1) {
          return `cron:${parsed.minute} ${parsed.hour} */${interval} * *`;
        }
        return `${parsed.minute} ${parsed.hour} * * *`;
      }
    }

    const weeklyMatch = cleaned.match(
      /^weekly\s+on\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s+at\s+(\d{1,2}:\d{2}))?$/
    );
    if (weeklyMatch) {
      const dayName = weeklyMatch[1];
      const time = weeklyMatch[2] || '00:00';
      const parsed = parseHourMinute(time);
      if (parsed) {
        const dayValue = dayToCron[dayName] ?? '0';
        return `${parsed.minute} ${parsed.hour} * * ${dayValue}`;
      }
    }

    const monthlyMatch = cleaned.match(
      /^monthly(?:\s+on\s+(\d{1,2}))(?:\s+at\s+(\d{1,2}:\d{2}))?$/
    );
    if (monthlyMatch) {
      const dayOfMonth = Math.min(Math.max(Number(monthlyMatch[1]), 1), 28);
      const time = monthlyMatch[2] || '00:00';
      const parsed = parseHourMinute(time);
      if (parsed) {
        return `${parsed.minute} ${parsed.hour} ${dayOfMonth} * *`;
      }
    }

    const cronMatch = cleaned.match(/^cron:(.+)$/i);
    if (cronMatch && cronMatch[1].trim()) {
      return cronMatch[1].trim();
    }

    const tokens = cleaned.split(/\s+/).filter(Boolean);
    if (tokens.length === 5) {
      return tokens.join(' ');
    }

    return null;
  }

  function handleCustomScheduleDescriptionChange(
    repoId: string,
    ruleId: string,
    description: string
  ) {
    updateAutomationRuleField(repoId, ruleId, 'customScheduleDescription', description);
    if (!description.trim()) {
      updateAutomationRuleField(repoId, ruleId, 'customCron', '');
      return;
    }
    const parsedCron = convertNaturalLanguageToCron(description);
    if (parsedCron) {
      updateAutomationRuleField(repoId, ruleId, 'customCron', parsedCron);
    }
  }

  function getConnectionById(connectionId: string) {
    return connections.find(
      (connection) => connection.connection_id === connectionId || connection.id === connectionId
    );
  }

  function getResourcesForConnection(connectionId: string) {
    const connection = getConnectionById(connectionId);
    if (!connection) return [];
    const normalizedProvider = normalizeProviderName(connection.provider);
    const cached = normalizedProvider ? providerResources[normalizedProvider] : undefined;
    if (cached && cached.length > 0) {
      return cached;
    }
    const raw = connection?.metadata?.resources || connection?.metadata?.targets || [];
    if (!raw || !Array.isArray(raw)) {
      return [];
    }
    return raw
      .map((item: any) => {
        if (!item) return null;
        if (typeof item === 'string') {
          return { id: item, name: item };
        }
        const id = item.resource_id || item.id || item.name;
        const name = item.name || item.label || item.resource_id || item.id;
        if (!id) return null;
        return { id, name: name || id };
      })
      .filter(Boolean) as Array<{ id: string; name: string }>;
  }

  async function loadResourcesForProvider(provider: string) {
    const normalizedProvider = normalizeProviderName(provider);
    if (!normalizedProvider || !isKnowledgeBaseProvider(normalizedProvider)) {
      return;
    }
    if (providerResourceLoading[normalizedProvider]) {
      return;
    }
    if (providerResources[normalizedProvider]?.length && !providerResourceErrors[normalizedProvider]) {
      return;
    }

    setProviderResourceLoading((prev) => ({ ...prev, [normalizedProvider]: true }));
    setProviderResourceErrors((prev) => ({ ...prev, [normalizedProvider]: '' }));

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        throw new Error('Not authenticated');
      }

      const params = new URLSearchParams({ provider: normalizedProvider });
      const response = await fetch(`/api/push/resources?${params.toString()}`, {
        method: 'GET',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        }
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.detail || 'Failed to load resources');
      }

      const normalized = (result.resources || [])
        .map((resource: any) => {
          const id = resource.id || resource.resource_id || resource.page_id;
          const name =
            resource.title ||
            resource.name ||
            resource.label ||
            resource.url ||
            resource.id ||
            resource.resource_id ||
            'Untitled resource';
          return id ? { id, name } : null;
        })
        .filter(Boolean) as Array<{ id: string; name: string }>;

      setProviderResources((prev) => ({
        ...prev,
        [normalizedProvider]: normalized
      }));
    } catch (err: any) {
      console.error('Failed to load resources for provider', provider, err);
      setProviderResourceErrors((prev) => ({
        ...prev,
        [normalizedProvider]: err?.message || 'Failed to load resources'
      }));
    } finally {
      setProviderResourceLoading((prev) => ({ ...prev, [normalizedProvider]: false }));
    }
  }

  function setRuleConnection(
    repoId: string,
    ruleId: string,
    connectionId: string,
    provider: string
  ) {
    const normalizedProvider = normalizeProviderName(provider);
    setAutomationRuleForms((prev) => {
      const existing = prev[repoId] || [];
      const updated = existing.map((form) => {
        if (form.id !== ruleId) return form;
        return {
          ...form,
          auto_publish_target_connection_id: connectionId,
          auto_publish_target_provider: normalizedProvider,
          auto_publish_target_resource_id: '',
          auto_publish_custom_resource: ''
        };
      });
      return { ...prev, [repoId]: updated };
    });
    if (normalizedProvider && isKnowledgeBaseProvider(normalizedProvider)) {
      loadResourcesForProvider(normalizedProvider);
    }
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
        if (intervalDays > 1) {
          return `interval:${intervalDays}d`;
        }
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

    if (form.name.trim()) {
      rule.name = form.name.trim();
    }

    if (form.customScheduleDescription.trim()) {
      rule.custom_schedule_description = form.customScheduleDescription.trim();
    }

    const provider = form.auto_publish_target_provider.trim();
    const resourceId =
      form.auto_publish_target_resource_id.trim() || form.auto_publish_custom_resource.trim();

    if (provider || resourceId) {
      rule.auto_publish_target = {
        ...(provider && { provider }),
        ...(resourceId && { resource_id: resourceId })
      };
    }

    return rule;
  }

  function updateAutomationRuleField(
    repoId: string,
    ruleId: string,
    field: keyof AutomationRuleForm,
    value: AutomationRuleForm[keyof AutomationRuleForm]
  ) {
    setAutomationRuleForms((prev) => {
      const existing = prev[repoId] || [];
      const updated = existing.map((form) =>
        form.id === ruleId ? { ...form, [field]: value } : form
      );
      return {
        ...prev,
        [repoId]: updated
      };
    });
  }

  function addAutomationRuleForm(repoId: string) {
    setAutomationRuleForms((prev) => {
      const existing = prev[repoId] || [];
      return {
        ...prev,
        [repoId]: [...existing, createAutomationRuleForm()]
      };
    });
  }

  function openRuleConfigurationForNewRule(repoId: string) {
    setAutomationConfigOpen(true);
    addAutomationRuleForm(repoId);
  }

  function removeAutomationRuleForm(repoId: string, ruleId: string) {
    setAutomationRuleForms((prev) => {
      const existing = prev[repoId] || [];
      const updated = existing.filter((form) => form.id !== ruleId);
      return {
        ...prev,
        [repoId]: updated
      };
    });
  }

  // Repository management functions
  async function loadRepos() {
    setLoadingRepos(true);
    try {
      const response = await fetch('/api/repos');
      if (!response.ok) throw new Error('Failed to load repositories');
      const data = await response.json();
      setRepos(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load repositories');
    } finally {
      setLoadingRepos(false);
    }
  }

  async function handleAddRepo() {
    if (!formName || !formRepoUrl) {
      setError('Name and repository URL are required');
      return;
    }

    setFormSubmitting(true);
    setError('');

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
      setSuccess('Repository added successfully!');
      await loadRepos();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to add repository');
    } finally {
      setFormSubmitting(false);
    }
  }

  async function fetchAutomationRules(repoId: string) {
    setAutomationLoading((prev) => ({ ...prev, [repoId]: true }));
    setAutomationAlerts((prev) => ({ ...prev, [repoId]: null }));

    try {
      const response = await fetch(`/api/repos/${repoId}/automation`, {
        method: 'GET',
        credentials: 'include'
      });

      if (!response.ok) {
        const errorDetail = await response.json().catch(() => null);
        throw new Error(errorDetail?.error || errorDetail?.detail || 'Failed to load automation rules');
      }

      const data = await response.json();
      setAutomationCache((prev) => ({ ...prev, [repoId]: data }));
      const forms = mapRulesToForms(data.automation_rules || []);
      setAutomationRuleForms((prev) => ({
        ...prev,
        [repoId]: forms.length ? forms : [createAutomationRuleForm()]
      }));
    } catch (error: any) {
      setAutomationAlerts((prev) => ({
        ...prev,
        [repoId]: {
          type: 'error',
          message: error?.message || 'Failed to load automation rules'
        }
      }));
    } finally {
      setAutomationLoading((prev) => ({ ...prev, [repoId]: false }));
    }
  }

  async function handleSaveAutomationRules(repoId: string, ruleFormsOverride?: AutomationRuleForm[]) {
    const ruleForms = ruleFormsOverride ?? automationRuleForms[repoId] ?? [createAutomationRuleForm()];
    const parsed = ruleForms.map((form) => formToRule(form));

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
        throw new Error(errorDetail?.error || errorDetail?.detail || 'Failed to save automation rules');
      }

      const updated = await response.json();

      setAutomationCache((prev) => ({ ...prev, [repoId]: updated }));
      const nextForms = mapRulesToForms(updated.automation_rules || []);
      setAutomationRuleForms((prev) => ({
        ...prev,
        [repoId]: nextForms.length ? nextForms : [createAutomationRuleForm()]
      }));
      setAutomationAlerts((prev) => ({
        ...prev,
        [repoId]: {
          type: 'success',
          message: 'Automation rules saved'
        }
      }));
      setAutomationConfigOpen(false);
    } catch (error: any) {
      setAutomationAlerts((prev) => ({
        ...prev,
        [repoId]: {
          type: 'error',
          message: error?.message || 'Failed to save automation rules'
        }
      }));
    } finally {
      setAutomationSaving((prev) => ({ ...prev, [repoId]: false }));
    }
  }

  function scrollToAutomationRuleForm(ruleId: string) {
    const element = ruleFormRefs.current[ruleId];
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function handleConfiguredRuleToggle(ruleId: string) {
    if (!activeAutomationRepoId) {
      return;
    }
    if (!ruleId) {
      return;
    }
    const repoId = activeAutomationRepoId;
    const existingForms = automationRuleForms[repoId] ?? mapRulesToForms(automationRules);
    if (!existingForms.some((form) => form.id === ruleId)) {
      return;
    }
    const updatedForms = existingForms.map((form) =>
      form.id === ruleId ? { ...form, enabled: !form.enabled } : form
    );
    setAutomationRuleForms((prev) => ({ ...prev, [repoId]: updatedForms }));
    handleSaveAutomationRules(repoId, updatedForms);
  }

  async function handleConfiguredRuleDelete(ruleId: string) {
    if (!activeAutomationRepoId) {
      return;
    }
    const repoId = activeAutomationRepoId;
    const existingForms = automationRuleForms[repoId] ?? mapRulesToForms(automationRules);
    const updatedForms = existingForms.filter((form) => form.id !== ruleId);
    setAutomationRuleForms((prev) => ({ ...prev, [repoId]: updatedForms }));
    await handleSaveAutomationRules(repoId, updatedForms);
  }

  function closeDetailsMenu(event: MouseEvent<HTMLButtonElement>) {
    const details = event.currentTarget.closest('details');
    if (details) {
      details.open = false;
    }
  }

  function openAutomationModal(repoId: string) {
    setActiveAutomationRepoId(repoId);
  }

  function requestRuleConfiguration(repoId: string, ruleId: string) {
    setAutomationConfigOpen(true);
    setPendingRuleConfiguration({ repoId, ruleId });
    setActiveAutomationRepoId(repoId);
  }

  function closeAutomationModal() {
    setActiveAutomationRepoId(null);
  }

  useEffect(() => {
    if (activeAutomationRepoId) {
      fetchAutomationRules(activeAutomationRepoId);
    }
  }, [activeAutomationRepoId]);

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

  async function fetchBranches() {
    if (!formRepoUrl.trim() || !formRepoUrl.includes('github.com')) {
      setBranches([]);
      return;
    }

    const noProto = formRepoUrl.replace(/^https?:\/\//, '');
    const parts = noProto.split('/').filter(Boolean);
    if (parts.length < 3) {
      return;
    }

    setLoadingBranches(true);
    try {
      const response = await fetch('/api/github/branches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repoUrl: formRepoUrl })
      });

      if (response.ok) {
        const data = await response.json();
        const branchList = data.branches || [];
        setBranches(branchList);
        if (branchList.length > 0 && !branchList.includes(formBranch)) {
          setFormBranch(branchList[0]);
        }
      } else {
        setBranches([]);
      }
    } catch (err) {
      console.error('Failed to fetch branches:', err);
      setBranches([]);
    } finally {
      setLoadingBranches(false);
    }
  }

  async function fetchDirectories() {
    if (!formRepoUrl.trim() || !formRepoUrl.includes('github.com') || !formBranch) {
      setDirectories([]);
      return;
    }

    setLoadingDirectories(true);
    try {
      const response = await fetch('/api/github/directories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repoUrl: formRepoUrl, branch: formBranch })
      });

      if (response.ok) {
        const data = await response.json();
        setDirectories(data.directories || []);
      } else {
        setDirectories([]);
      }
    } catch (err) {
      console.error('Failed to fetch directories:', err);
      setDirectories([]);
    } finally {
      setLoadingDirectories(false);
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

  const activeAutomationRepo = repos.find(repo => repo.id === activeAutomationRepoId) || null;
  const currentAutomationEntry = activeAutomationRepoId ? automationCache[activeAutomationRepoId] : undefined;
  const automationRules = currentAutomationEntry?.automation_rules ?? [];
  const automationMetadata = currentAutomationEntry?.automation_metadata ?? {};
  const activeAutomationForms = activeAutomationRepoId ? automationRuleForms[activeAutomationRepoId] ?? [] : [];
  const isNotionConnected = connections.some(c => c.provider === 'notion' && c.status === 'active');
  const isConfluenceConnected = connections.some(c => c.provider === 'confluence' && c.status === 'active');
  const isGoogleDocsConnected = connections.some(c => c.provider === 'googledocs' && c.status === 'active');
  const isGitHubConnected = connections.some(c => c.provider === 'github' && c.status === 'active');
  const knowledgeBaseConnections = connections.filter((connection) =>
    isKnowledgeBaseProvider(connection.provider)
  );
  const connectedKnowledgeBaseProviders = Array.from(
    new Set(
      knowledgeBaseConnections
        .map((connection) => normalizeProviderName(connection.provider))
        .filter(Boolean)
    )
  );

  useEffect(() => {
    if (!pendingRuleConfiguration) {
      return;
    }

    if (activeAutomationRepoId !== pendingRuleConfiguration.repoId) {
      return;
    }

    const element = ruleFormRefs.current[pendingRuleConfiguration.ruleId];
    if (!element) {
      return;
    }

    scrollToAutomationRuleForm(pendingRuleConfiguration.ruleId);
    setPendingRuleConfiguration(null);
  }, [pendingRuleConfiguration, activeAutomationRepoId, activeAutomationForms.length, automationConfigOpen]);

  return (
    <>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Settings className="h-8 w-8 text-white" />
            <h1 className="text-3xl font-bold text-white">Settings</h1>
          </div>
          <p className="text-white/70">
            Manage your account settings, integrations, and preferences.
          </p>
        </div>

        {/* Tabs Navigation */}
        <div className="mb-8 border-b border-white/10">
          <nav className="flex gap-1" aria-label="Settings tabs">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTabAndUpdateUrl(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === tab.id
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-white/60 hover:text-white hover:border-white/20'
                    }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.name}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {activeTab === 'profile' ? (
            /* Profile Tab */
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-white mb-2">Profile</h2>
                <p className="text-white/70">Manage your account information</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
                      <User className="h-8 w-8 text-white/70" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-white">{initialUser?.email || 'User'}</p>
                      <p className="text-sm text-white/60">Account ID: {initialUser?.id || 'N/A'}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-2">
                        <Mail className="inline h-4 w-4 mr-2" />
                        Email Address
                      </label>
                      <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white">
                        {initialUser?.email || 'Not available'}
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/10">
                    <p className="text-sm text-white/60">
                      Profile management features coming soon. For now, your account information is managed through authentication.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'integrations' ? (
            /* Integrations Tab */
            <div>
              {/* Success/Error Messages */}
              {success && (
                <div className="mb-6 rounded-lg border border-green-500/50 bg-green-500/10 p-4 text-green-200">
                  <div className="flex items-center gap-2">
                    <Check className="h-5 w-5" />
                    <p>{success}</p>
                  </div>
                </div>
              )}

              {error && (
                <div className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-200">
                  <p className="font-medium">Error</p>
                  <p className="text-sm">{error}</p>
                </div>
              )}

              {/* Available Integrations */}
              <div className="mb-8">
                <h2 className="text-xl font-semibold text-white mb-4">Available Integrations</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {/* GitHub Integration */}
                  <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/5">
                          <Github className="h-7 w-7 text-white" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">GitHub</h3>
                          <p className="text-sm text-white/60">Access your repositories and private repos</p>
                        </div>
                      </div>
                      {isGitHubConnected && (
                        <span className="flex items-center gap-1 rounded-full bg-green-500/20 px-3 py-1 text-xs text-green-300">
                          <Check className="h-3 w-3" />
                          Connected
                        </span>
                      )}
                    </div>
                    {isGitHubConnected ? (
                      <button
                        onClick={() => {
                          const conn = connections.find(c => c.provider === 'github');
                          if (conn) openDisconnectModal(conn.connection_id, 'github');
                        }}
                        className="w-full rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/20"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={() => connectToProvider('github')}
                        disabled={connecting}
                        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {connecting ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Connecting...
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            <Link2 className="h-4 w-4" />
                            Connect GitHub
                          </span>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Notion Integration */}
                  <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/5">
                          <IntegrationLogos provider="notion" size={28} />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">Notion</h3>
                          <p className="text-sm text-white/60">Access and sync your Notion pages</p>
                        </div>
                      </div>
                      {isNotionConnected && (
                        <span className="flex items-center gap-1 rounded-full bg-green-500/20 px-3 py-1 text-xs text-green-300">
                          <Check className="h-3 w-3" />
                          Connected
                        </span>
                      )}
                    </div>
                    {isNotionConnected ? (
                      <button
                        onClick={() => {
                          const conn = connections.find(c => c.provider === 'notion');
                          if (conn) openDisconnectModal(conn.connection_id, 'notion');
                        }}
                        className="w-full rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/20"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={() => connectToProvider('notion')}
                        disabled={connecting}
                        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {connecting ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Connecting...
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            <Link2 className="h-4 w-4" />
                            Connect Notion
                          </span>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Confluence Integration */}
                  <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/5">
                          <IntegrationLogos provider="confluence" size={28} />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">Confluence</h3>
                          <p className="text-sm text-white/60">Access and sync your Confluence pages</p>
                        </div>
                      </div>
                      {isConfluenceConnected && (
                        <span className="flex items-center gap-1 rounded-full bg-green-500/20 px-3 py-1 text-xs text-green-300">
                          <Check className="h-3 w-3" />
                          Connected
                        </span>
                      )}
                    </div>
                    {isConfluenceConnected ? (
                      <button
                        onClick={() => {
                          const conn = connections.find(c => c.provider === 'confluence');
                          if (conn) openDisconnectModal(conn.connection_id, 'confluence');
                        }}
                        className="w-full rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/20"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={() => connectToProvider('confluence')}
                        disabled={connecting}
                        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {connecting ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Connecting...
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            <Link2 className="h-4 w-4" />
                            Connect Confluence
                          </span>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Google Docs Integration */}
                  <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/5">
                          <IntegrationLogos provider="google-docs" size={28} />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">Google Docs</h3>
                          <p className="text-sm text-white/60">Access and sync your Google Docs</p>
                        </div>
                      </div>
                      {isGoogleDocsConnected && (
                        <span className="flex items-center gap-1 rounded-full bg-green-500/20 px-3 py-1 text-xs text-green-300">
                          <Check className="h-3 w-3" />
                          Connected
                        </span>
                      )}
                    </div>
                    {isGoogleDocsConnected ? (
                      <button
                        onClick={() => {
                          const conn = connections.find(c => c.provider === 'googledocs');
                          if (conn) openDisconnectModal(conn.connection_id, 'googledocs');
                        }}
                        className="w-full rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/20"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={() => connectToProvider('google-docs')}
                        disabled={connecting}
                        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {connecting ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Connecting...
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            <Link2 className="h-4 w-4" />
                            Connect Google Docs
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Active Connections */}
              <div>
                <h2 className="text-xl font-semibold text-white mb-4">Active Connections</h2>
                {loading ? (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-white/50 mx-auto mb-2" />
                    <p className="text-white/60">Loading connections...</p>
                  </div>
                ) : connections.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
                    <Link2 className="h-12 w-12 text-white/30 mx-auto mb-4" />
                    <p className="text-white/60">No active connections</p>
                    <p className="text-sm text-white/40 mt-2">Connect an integration above to get started</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {connections.map(connection => (
                      <div key={connection.id} className="rounded-lg border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5">
                              {connection.provider === 'github' ? (
                                <Github className="h-6 w-6 text-white" />
                              ) : (
                                <IntegrationLogos
                                  provider={(connection.provider === 'googledocs' ? 'google-docs' : connection.provider) as 'notion' | 'slack' | 'confluence' | 'google-docs' | 'jira'}
                                  size={24}
                                />
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-white">{getProviderName(connection.provider)}</p>
                              <p className="text-xs text-white/60">
                                Connected {formatDate(connection.created_at)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {connection.status === 'active' && (
                              <span className="flex items-center gap-1 rounded-full bg-green-500/20 px-2 py-1 text-xs text-green-300">
                                <Check className="h-3 w-3" />
                                Active
                              </span>
                            )}
                            <button
                              onClick={() => openDisconnectModal(connection.connection_id, connection.provider)}
                              className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-1.5 text-sm text-red-300 transition-colors hover:bg-red-500/20"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'repositories' ? (
            /* Repositories Tab */
            <div>
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-2xl font-semibold text-white">Repositories</h2>
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
                      }
                      setShowAddForm(!showAddForm);
                    }}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    {showAddForm ? 'Cancel' : 'Add Repository'}
                  </button>
                </div>
                <p className="text-white/70">Register repositories to enable manual documentation generation and tracking.</p>
              </div>

              {/* Add Repository Form */}
              {showAddForm && (
                <div className="mb-8 rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                  <h3 className="text-lg font-semibold text-white mb-4">Add Repository</h3>
                  <div className="space-y-4">
                    {/* Owner Search */}
                    <div>
                      <label className="block text-sm font-medium text-white/90 mb-1">
                        Search by Owner/Organization
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
                    <div>
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
                    <div>
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
                    <div className="grid grid-cols-2 gap-4">
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
                </div>
              )}

              {/* Repositories List */}
              {loadingRepos ? (
                <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-white/50 mx-auto mb-2" />
                  <p className="text-white/60">Loading repositories...</p>
                </div>
              ) : repos.length === 0 ? (
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
                        <th className="px-4 py-3 text-left text-sm font-semibold text-white/90">Provider</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-white/90">Added</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-white/90">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {repos.map((repo) => {
                        const repoInfo = parseRepoUrl(repo.repo_url);
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
                              <span className="inline-flex items-center gap-1 rounded border border-blue-400/30 bg-blue-500/20 px-2 py-1 text-xs text-blue-200 capitalize">
                                {repo.provider}
                              </span>
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
                                  Automation
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
          ) : (
            /* Preferences Tab */
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-white mb-2">Preferences</h2>
                <p className="text-white/70">Customize your application preferences</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <Sliders className="h-16 w-16 text-white/30 mx-auto mb-4" />
                    <p className="text-white/60 mb-2">Preferences coming soon</p>
                    <p className="text-sm text-white/40">
                      Configure default LLM models, prompt settings, and other preferences here.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Disconnect Confirmation Modal */}
      {disconnectModalOpen && connectionToDisconnect && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={closeDisconnectModal}
          onKeyDown={(e) => e.key === 'Escape' && closeDisconnectModal()}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-xl border border-white/20 bg-black/90 p-6 shadow-xl backdrop-blur-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-xl font-semibold text-white">Disconnect Integration</h2>
            <p className="mb-6 text-white/70">
              Are you sure you want to disconnect from <span className="font-semibold text-white">
                {getProviderName(connectionToDisconnect.provider)}
              </span>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                className="rounded-lg border border-white/20 px-4 py-2 text-white/80 hover:bg-white/10"
                onClick={closeDisconnectModal}
              >
                Cancel
              </button>
              <button
                className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-red-300 transition-colors hover:bg-red-500/20"
                onClick={async () => {
                  if (connectionToDisconnect) {
                    await disconnect(connectionToDisconnect.connectionId, connectionToDisconnect.provider);
                    closeDisconnectModal();
                  }
                }}
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}

      {activeAutomationRepo && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={closeAutomationModal}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              closeAutomationModal();
            }
          }}
        >
          <div
            className="w-full max-w-3xl rounded-2xl border border-white/20 bg-black/95 shadow-xl"
            style={{ maxHeight: '85vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-full flex-col">
              <div className="space-y-6 px-6 py-6 text-white">
                <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5/20 p-4 md:flex-row md:items-center md:justify-between">
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
                    Loading automation rules...
                  </div>
                ) : (
                  <div className="space-y-6 overflow-y-auto px-6 py-6" style={{ maxHeight: 'calc(85vh - 140px)' }}>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/0 p-4">
                        <p className="text-xs uppercase tracking-wider text-white/60">Last run</p>
                        <p className="text-lg font-semibold text-white">
                          {automationMetadata.last_run_at ? formatDate(automationMetadata.last_run_at) : 'Not run yet'}
                        </p>
                        <p className="text-xs text-white/60 mt-1">
                          Status: {automationMetadata.last_run_status || 'pending'}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                        <p className="text-xs uppercase tracking-wider text-white/60">Latest status</p>
                        <p className="text-sm font-semibold text-white">
                          {automationMetadata.last_run_status || 'Waiting for the first execution'}
                        </p>
                        {automationMetadata.last_run_error && (
                          <p className="mt-2 text-xs text-rose-300">
                            Error: {automationMetadata.last_run_error}
                          </p>
                        )}
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                        <p className="text-xs uppercase tracking-wider text-white/60">Configured rules</p>
                        <p className="text-lg font-semibold text-white">{automationRules.length}</p>
                        <p className="text-xs text-white/60 mt-1">rules defined</p>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-white/80">Configured rules</p>
                        <div className="flex items-center gap-3">
                          <p className="text-xs text-white/50">{automationRules.length} defined</p>
                          <button
                            type="button"
                            onClick={() => openRuleConfigurationForNewRule(activeAutomationRepo.id)}
                            className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/20"
                          >
                            Add rule
                          </button>
                        </div>
                      </div>

                      {automationRules.length > 0 ? (
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          {automationRules.map((rule, index) => {
                            const ruleId = rule?.id;
                            const enabled = Boolean(rule?.enabled);
                            return (
                              <div key={ruleId || index} className="rounded-lg border border-white/10 bg-white/5 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold text-white">
                                      {rule?.name || ruleId || 'Untitled rule'}
                                    </p>
                                    <p className="text-xs text-white/60">Schedule: {rule?.schedule || '—'}</p>
                                    <p className="text-xs text-white/60">Enabled: {enabled ? 'Yes' : 'No'}</p>
                                    {rule?.auto_publish && (
                                      <p className="text-xs text-emerald-300">Auto-publish enabled</p>
                                    )}
                                  </div>
                                  <div className="flex flex-col items-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => ruleId && handleConfiguredRuleToggle(ruleId)}
                                      aria-pressed={enabled}
                                      className="inline-flex items-center gap-3 rounded-full border border-transparent bg-transparent px-2 py-1 transition"
                                    >
                                      <span
                                        className={`relative inline-flex h-5 w-10 rounded-full transition-colors duration-200 ${enabled ? 'bg-emerald-500/70' : 'bg-white/10'
                                          }`}
                                      >
                                        <span
                                          className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ${enabled ? 'translate-x-[1.05rem]' : 'translate-x-0.5'
                                            }`}
                                        ></span>
                                      </span>
                                      <span
                                        className={`text-xs font-semibold transition ${enabled ? 'text-emerald-200' : 'text-white/60'
                                          }`}
                                      >
                                        {enabled ? 'Enabled' : 'Disabled'}
                                      </span>
                                    </button>
                                    <details className="relative">
                                      <summary
                                        className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 text-white/80 transition hover:bg-white/10"
                                        aria-label="Open rule actions"
                                      >
                                        <span className="text-sm font-semibold leading-none">•••</span>
                                      </summary>
                                      <div className="absolute right-0 top-full z-10 mt-2 w-36 rounded-xl border border-white/10 bg-black/80 shadow-xl">
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.preventDefault();
                                            if (ruleId && activeAutomationRepo) {
                                              requestRuleConfiguration(activeAutomationRepo.id, ruleId);
                                            }
                                            closeDetailsMenu(event);
                                          }}
                                          className="w-full px-3 py-2 text-left text-xs font-medium text-white/80 hover:bg-white/5"
                                        >
                                          Update settings
                                        </button>
                                        <button
                                          type="button"
                                          onClick={async (event) => {
                                            event.preventDefault();
                                            if (ruleId) {
                                              await handleConfiguredRuleDelete(ruleId);
                                            }
                                            closeDetailsMenu(event);
                                          }}
                                          className="w-full px-3 py-2 text-left text-xs font-medium text-white/80 hover:bg-white/5"
                                        >
                                          Delete rule
                                        </button>
                                      </div>
                                    </details>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-white/60">
                          No automation rules configured yet. Add one below to get started.
                        </p>
                      )}
                    </div>

                    {automationConfigOpen && (
                      <div className="space-y-6">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-white/80">Rule configuration</p>
                            <p className="text-xs text-white/60">
                              Define when detection runs, what gets generated, and how publishing should behave.
                            </p>
                          </div>
                        </div>
                        {!activeAutomationForms.length && (
                          <p className="text-sm text-white/60">
                            No automation rules yet. Add one to get started.
                          </p>
                        )}
                        <div className="space-y-4">
                          {activeAutomationForms.map((form, index) => (
                            (() => {
                              const connectionId = form.auto_publish_target_connection_id;
                              const selectedConnection = getConnectionById(connectionId);
                              const selectedProvider =
                                selectedConnection?.provider || form.auto_publish_target_provider;
                              const normalizedSelectedProvider = normalizeProviderName(selectedProvider);
                              const providerSupportsResources =
                                Boolean(
                                  normalizedSelectedProvider &&
                                  isKnowledgeBaseProvider(normalizedSelectedProvider)
                                );
                              const providerResourceList = normalizedSelectedProvider
                                ? providerResources[normalizedSelectedProvider] || []
                                : [];
                              const resourceOptions = connectionId
                                ? getResourcesForConnection(connectionId)
                                : providerResourceList;
                              const providerDisplayName = selectedProvider ? getProviderDisplayName(selectedProvider) : '';
                              const resourceLoading = normalizedSelectedProvider
                                ? providerResourceLoading[normalizedSelectedProvider]
                                : false;
                              const resourceError = normalizedSelectedProvider
                                ? providerResourceErrors[normalizedSelectedProvider]
                                : '';
                              const helperText =
                                !connectionId && !selectedProvider
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
                              const defaultOptionLabel = resourceLoading
                                ? `Loading ${providerDisplayName || 'resources'}...`
                                : 'Select a resource';
                              const isEnabled = form.enabled;
                              return (
                                <div
                                  key={form.id}
                                  ref={(el) => {
                                    if (!form.id) return;
                                    if (el) {
                                      ruleFormRefs.current[form.id] = el;
                                    } else {
                                      delete ruleFormRefs.current[form.id];
                                    }
                                  }}
                                  className="space-y-5 rounded-2xl border border-white/10 bg-black/40 p-5"
                                >
                                  <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                      <p className="text-sm font-semibold text-white">Rule #{index + 1}</p>
                                      <button
                                        type="button"
                                        onClick={() => removeAutomationRuleForm(activeAutomationRepo.id, form.id)}
                                        className="text-xs font-medium text-rose-400 transition hover:text-rose-200"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateAutomationRuleField(
                                            activeAutomationRepo.id,
                                            form.id,
                                            'enabled',
                                            !isEnabled
                                          )
                                        }
                                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition ${isEnabled
                                          ? 'border-emerald-500 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                                          : 'border-white/30 text-white/60 hover:border-white/50 hover:text-white'
                                          }`}
                                      >
                                        {isEnabled ? 'Enabled' : 'Disabled'}
                                      </button>
                                      <p className="text-xs text-white/60">When off, the rule is ignored.</p>
                                    </div>
                                  </div>
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <label className="text-sm text-white/80">
                                      Rule label
                                      <input
                                        type="text"
                                        value={form.name}
                                        onChange={(event) =>
                                          updateAutomationRuleField(activeAutomationRepo.id, form.id, 'name', event.target.value)
                                        }
                                        className="mt-1 w-full rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                                        placeholder="e.g., Nightly documentation"
                                      />
                                    </label>
                                    <label className="text-sm text-white/80">
                                      Schedule
                                      <select
                                        value={form.scheduleType}
                                        onChange={(event) =>
                                          updateAutomationRuleField(
                                            activeAutomationRepo.id,
                                            form.id,
                                            'scheduleType',
                                            event.target.value as AutomationRuleForm['scheduleType']
                                          )
                                        }
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
                                  {form.scheduleType === 'minutes' && (
                                    <div className="grid gap-3 md:grid-cols-2">
                                      <label className="text-sm text-white/80">
                                        Every
                                        <input
                                          type="number"
                                          min="1"
                                          value={form.scheduleIntervalValue}
                                          onChange={(event) =>
                                            updateAutomationRuleField(
                                              activeAutomationRepo.id,
                                              form.id,
                                              'scheduleIntervalValue',
                                              event.target.value
                                            )
                                          }
                                          className="mt-1 rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                                        />
                                      </label>
                                      <div className="text-sm text-white/70 flex items-center">
                                        minutes (interval-based)
                                      </div>
                                    </div>
                                  )}
                                  {form.scheduleType === 'hours' && (
                                    <div className="grid gap-3 md:grid-cols-2">
                                      <label className="text-sm text-white/80">
                                        Every
                                        <input
                                          type="number"
                                          min="1"
                                          value={form.scheduleIntervalValue}
                                          onChange={(event) =>
                                            updateAutomationRuleField(
                                              activeAutomationRepo.id,
                                              form.id,
                                              'scheduleIntervalValue',
                                              event.target.value
                                            )
                                          }
                                          className="mt-1 rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                                        />
                                      </label>
                                      <div className="text-sm text-white/70 flex items-center">
                                        hours (interval-based)
                                      </div>
                                    </div>
                                  )}
                                  {form.scheduleType === 'daily' && (
                                    <div className="grid gap-3 md:grid-cols-3">
                                      <label className="text-sm text-white/80">
                                        Every
                                        <input
                                          type="number"
                                          min="1"
                                          value={form.scheduleIntervalValue}
                                          onChange={(event) =>
                                            updateAutomationRuleField(
                                              activeAutomationRepo.id,
                                              form.id,
                                              'scheduleIntervalValue',
                                              event.target.value
                                            )
                                          }
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
                                          value={form.scheduleTime}
                                          onChange={(event) =>
                                            updateAutomationRuleField(
                                              activeAutomationRepo.id,
                                              form.id,
                                              'scheduleTime',
                                              event.target.value
                                            )
                                          }
                                          className="mt-1 w-full rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                                        />
                                      </label>
                                    </div>
                                  )}
                                  {form.scheduleType === 'weekly' && (
                                    <div className="grid gap-3 md:grid-cols-2">
                                      <label className="text-sm text-white/80">
                                        Weekly day
                                        <select
                                          value={form.scheduleDay}
                                          onChange={(event) =>
                                            updateAutomationRuleField(
                                              activeAutomationRepo.id,
                                              form.id,
                                              'scheduleDay',
                                              event.target.value
                                            )
                                          }
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
                                          value={form.scheduleTime}
                                          onChange={(event) =>
                                            updateAutomationRuleField(
                                              activeAutomationRepo.id,
                                              form.id,
                                              'scheduleTime',
                                              event.target.value
                                            )
                                          }
                                          className="mt-1 w-full rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                                        />
                                      </label>
                                      <p className="text-xs text-white/50 md:col-span-2">
                                        For more granular weekly/bi-weekly cadences, describe them with the custom schedule option.
                                      </p>
                                    </div>
                                  )}
                                  {form.scheduleType === 'monthly' && (
                                    <div className="grid gap-3 md:grid-cols-3">
                                      <label className="text-sm text-white/80">
                                        Day of month
                                        <input
                                          type="number"
                                          min="1"
                                          max="28"
                                          value={form.scheduleMonthDay}
                                          onChange={(event) =>
                                            updateAutomationRuleField(
                                              activeAutomationRepo.id,
                                              form.id,
                                              'scheduleMonthDay',
                                              event.target.value
                                            )
                                          }
                                          className="mt-1 rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                                        />
                                      </label>
                                      <label className="text-sm text-white/80">
                                        Time (UTC)
                                        <input
                                          type="time"
                                          value={form.scheduleTime}
                                          onChange={(event) =>
                                            updateAutomationRuleField(
                                              activeAutomationRepo.id,
                                              form.id,
                                              'scheduleTime',
                                              event.target.value
                                            )
                                          }
                                          className="mt-1 w-full rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                                        />
                                      </label>
                                      <p className="text-xs text-white/50 md:col-span-3">
                                        For bi-monthly or more complex cadences, use the custom schedule field.
                                      </p>
                                    </div>
                                  )}
                                  {form.scheduleType === 'custom' && (
                                    <div className="grid gap-3">
                                      <label className="text-sm text-white/80">
                                        Custom schedule
                                        <input
                                          type="text"
                                          value={form.customScheduleDescription}
                                          onChange={(event) =>
                                            handleCustomScheduleDescriptionChange(
                                              activeAutomationRepo.id,
                                              form.id,
                                              event.target.value
                                            )
                                          }
                                          placeholder='e.g., "Weekly on Monday at 07:00" or "Every 10 minutes"'
                                          className="mt-1 w-full rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                                        />
                                        <p className="text-xs text-white/50 mt-1">
                                          {form.customCron
                                            ? `Cron expression: ${form.customCron}`
                                            : 'Describe the cadence in plain language; we convert it behind the scenes.'}
                                        </p>
                                      </label>
                                    </div>
                                  )}
                                  <div className="grid gap-3 lg:grid-cols-3">
                                    {[
                                      {
                                        field: 'detect_changes',
                                        label: 'Detect changes',
                                        helper: 'Only run when the repo has new commits.'
                                      },
                                      {
                                        field: 'generate_doc',
                                        label: 'Generate documentation',
                                        helper: 'Produce a doc if changes are found.'
                                      }
                                    ].map(({ field, label, helper }) => (
                                      <label key={field} className="flex flex-col gap-1 text-sm text-white/80">
                                        <span className="flex items-center gap-2">
                                          <input
                                            type="checkbox"
                                            checked={form[field as keyof AutomationRuleForm] as boolean}
                                            onChange={(event) =>
                                              updateAutomationRuleField(
                                                activeAutomationRepo.id,
                                                form.id,
                                                field as keyof AutomationRuleForm,
                                                event.target.checked as AutomationRuleForm[keyof AutomationRuleForm]
                                              )
                                            }
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
                                      {
                                        field: 'generate_diagram',
                                        label: 'Generate diagram',
                                        helper: 'Include architecture diagrams.'
                                      },
                                      {
                                        field: 'auto_publish',
                                        label: 'Auto-publish',
                                        helper: 'Approve docs automatically when thresholds pass.'
                                      },
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
                                            checked={form[field as keyof AutomationRuleForm] as boolean}
                                            onChange={(event) =>
                                              updateAutomationRuleField(
                                                activeAutomationRepo.id,
                                                form.id,
                                                field as keyof AutomationRuleForm,
                                                event.target.checked as AutomationRuleForm[keyof AutomationRuleForm]
                                              )
                                            }
                                            className="h-4 w-4 rounded border-white/30 bg-black/60 text-blue-500 focus:ring-0"
                                          />
                                          {label}
                                        </span>
                                        <span className="text-xs text-white/60">{helper}</span>
                                      </label>
                                    ))}
                                  </div>
                                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                    <label className="text-sm text-white/80">
                                      Max changes
                                      <input
                                        type="number"
                                        min="0"
                                        value={form.auto_publish_max_changes}
                                        onChange={(event) =>
                                          updateAutomationRuleField(
                                            activeAutomationRepo.id,
                                            form.id,
                                            'auto_publish_max_changes',
                                            event.target.value
                                          )
                                        }
                                        className="mt-1 w-full rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                                      />
                                    </label>
                                    <label className="text-sm text-white/80">
                                      Max change %
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.1"
                                        value={form.auto_publish_max_change_percentage}
                                        onChange={(event) =>
                                          updateAutomationRuleField(
                                            activeAutomationRepo.id,
                                            form.id,
                                            'auto_publish_max_change_percentage',
                                            event.target.value
                                          )
                                        }
                                        className="mt-1 w-full rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                                      />
                                    </label>
                                    <div />
                                  </div>
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <label className="text-sm text-white/80">
                                      Target provider
                                      <select
                                        value={
                                          form.auto_publish_target_connection_id ||
                                          (form.auto_publish_target_provider ? `provider:${form.auto_publish_target_provider}` : '')
                                        }
                                        onChange={(event) => {
                                          const selectedValue = event.target.value;
                                          if (!selectedValue) {
                                            setRuleConnection(activeAutomationRepo.id, form.id, '', '');
                                            return;
                                          }
                                          if (selectedValue.startsWith('provider:')) {
                                            const provider = selectedValue.replace('provider:', '');
                                            setRuleConnection(activeAutomationRepo.id, form.id, '', provider);
                                            return;
                                          }
                                          const selectedConn = connections.find(
                                            (c) => c.connection_id === selectedValue || c.id === selectedValue
                                          );
                                          setRuleConnection(
                                            activeAutomationRepo.id,
                                            form.id,
                                            selectedValue,
                                            selectedConn?.provider ?? ''
                                          );
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
                                        value={form.auto_publish_target_resource_id || ''}
                                        onChange={(event) =>
                                          updateAutomationRuleField(
                                            activeAutomationRepo.id,
                                            form.id,
                                            'auto_publish_target_resource_id',
                                            event.target.value
                                          )
                                        }
                                        className="mt-1 w-full rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                                      >
                                        <option value="">{defaultOptionLabel}</option>
                                        {resourceOptions.map((resource) => (
                                          <option key={resource.id} value={resource.id}>
                                            {resource.name}
                                          </option>
                                        ))}
                                      </select>
                                      <p className="text-xs text-white/50 mt-1">{helperText}</p>
                                    </label>
                                  </div>
                                  <label className="text-sm text-white/80">
                                    Manual resource ID (optional)
                                    <input
                                      type="text"
                                      value={form.auto_publish_custom_resource}
                                      onChange={(event) =>
                                        updateAutomationRuleField(
                                          activeAutomationRepo.id,
                                          form.id,
                                          'auto_publish_custom_resource',
                                          event.target.value
                                        )
                                      }
                                      className="mt-1 w-full rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                                      placeholder="Enter an ID if none of the options match"
                                    />
                                  </label>
                                  <p className="text-xs text-white/50">
                                    Choose a provider resource or paste an ID so automation knows where to publish.
                                  </p>
                                  <div className="flex justify-end">
                                    <button
                                      type="button"
                                      onClick={() => handleSaveAutomationRules(activeAutomationRepo.id)}
                                      disabled={automationSaving[activeAutomationRepo.id]}
                                      className="inline-flex items-center gap-2 rounded-lg border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                      {automationSaving[activeAutomationRepo.id] ? 'Saving...' : 'Save'}
                                    </button>
                                  </div>
                                </div>
                              );
                            })()
                          ))}
                        </div>
                      </div>
                    )}

                    {automationAlerts[activeAutomationRepo.id] && (
                      <p className={`mt-2 text-sm ${automationAlerts[activeAutomationRepo.id]?.type === 'error' ? 'text-red-300' : 'text-emerald-300'}`}>
                        {automationAlerts[activeAutomationRepo.id]?.message}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

