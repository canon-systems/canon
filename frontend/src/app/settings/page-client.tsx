'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Settings, User, Link2, Mail, Check, Loader2, Github, Info } from 'lucide-react';
import { IntegrationLogos } from '@/components/IntegrationLogos';
import { getIntegrationsCached, clearIntegrationsCache } from '@/lib/client/integrationsCache';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Connection {
  id: string;
  provider: string;
  connection_id: string;
  status: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

type TabId = 'profile' | 'preferences' | 'integrations';

interface SettingsPageClientProps {
  user: SupabaseUser | null;
}

type IntegrationCard = {
  provider: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  comingSoon?: boolean;
};

const tabs: Array<{ id: TabId; name: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'profile', name: 'Profile', icon: User },
  { id: 'preferences', name: 'Preferences', icon: Settings },
  { id: 'integrations', name: 'Integrations', icon: Link2 }
];

const integrationCards: IntegrationCard[] = [
  {
    provider: 'github',
    name: 'GitHub',
    description: 'Install our GitHub App to sync repos and PR context.',
    icon: <Github className="h-7 w-7 text-white" />
  },
  {
    provider: 'slack',
    name: 'Slack',
    description: 'Connect Slack to receive signal alerts in your channel.',
    icon: <IntegrationLogos provider="slack" size={28} />
  },
  {
    provider: 'confluence',
    name: 'Atlassian',
    description: 'Connect Jira and Confluence. Keep spaces and issues in sync.',
    icon: <IntegrationLogos provider="atlassian" size={28} />
  }
];

const FALLBACK_TIMEZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Tokyo',
];

function resolveBrowserTimeZone(): string {
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return typeof resolved === 'string' && resolved.trim().length > 0 ? resolved : 'UTC';
}

export function SettingsPageClient({ user: initialUser }: SettingsPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const deliveryPreferenceOptions: Array<{
    value: 'slack_only' | 'email_only' | 'slack_then_email';
    label: string;
    helper: string;
  }> = [
    { value: 'slack_only', label: 'Slack', helper: 'Post to your configured Slack channel' },
    { value: 'email_only', label: 'Email', helper: 'Send alerts to an email address' },
    { value: 'slack_then_email', label: 'Both', helper: 'Try Slack first, then fall back to email' },
  ];

  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [user] = useState<SupabaseUser | null>(initialUser);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [debugNote, setDebugNote] = useState<string | null>(null);
  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false);
  const [connectionToDisconnect, setConnectionToDisconnect] = useState<{ connectionId: string; provider: string } | null>(null);
  const [uninstallOnDisconnect, setUninstallOnDisconnect] = useState(false);
  const [slackChannel, setSlackChannel] = useState('');
  const [slackLoading, setSlackLoading] = useState(true);
  const [slackSaving, setSlackSaving] = useState(false);
  const [slackMessage, setSlackMessage] = useState('');
  const [slackError, setSlackError] = useState('');
  const [emailDigestTo, setEmailDigestTo] = useState('');
  const [deliveryPreference, setDeliveryPreference] = useState<'slack_only' | 'email_only' | 'slack_then_email' | null>('slack_only');
  const [windowDays, setWindowDays] = useState<number>(7);
  const [timeZone, setTimeZone] = useState<string>(() => resolveBrowserTimeZone());
  const [timeZoneOptions, setTimeZoneOptions] = useState<string[]>(FALLBACK_TIMEZONES);

  useEffect(() => {
    const intlWithSupportedValues = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    const supportedValuesOf = intlWithSupportedValues.supportedValuesOf;
    if (typeof supportedValuesOf !== 'function') return;

    const zones = supportedValuesOf('timeZone');
    if (!Array.isArray(zones) || zones.length === 0) return;

    const merged = Array.from(new Set([...FALLBACK_TIMEZONES, ...zones]));
    setTimeZoneOptions(merged);
  }, []);

  const loadConnections = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const data = await getIntegrationsCached(force);
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
      setError(err instanceof Error ? err.message : 'Failed to load connections');
    } finally {
      setLoading(false);
    }
  }, []);

  // Get active tab from URL query param
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const validTabs: TabId[] = ['profile', 'preferences', 'integrations'];
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
      const provider = searchParams.get('provider') || 'atlassian';
      setDebugNote(`Last ${provider} error: ${decodeURIComponent(errorParam)}`);
      const tab = searchParams.get('tab') || 'integrations';
      router.replace(`/settings?tab=${tab}`);
      if (tabParam !== 'integrations') {
        setActiveTab('integrations');
      }
    }

    if (tabParam === 'integrations' || (!tabParam && activeTab === 'integrations')) {
      loadConnections();
    }
  }, [searchParams, router, activeTab, loadConnections]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  const loadDeliverySettings = useCallback(async () => {
    setSlackLoading(true);
    try {
      const response = await fetch('/api/settings/delivery', { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to load delivery settings');
      }
      const payload = await response.json();
      const channel = payload?.slack_channel;
      setSlackChannel(typeof channel === 'string' ? channel : '');
      setEmailDigestTo(typeof payload?.email_digest_to === 'string' ? payload.email_digest_to : '');
      const preference = payload?.delivery_preference;
      if (preference === 'slack_only' || preference === 'email_only' || preference === 'slack_then_email') {
        setDeliveryPreference(preference);
      } else {
        setDeliveryPreference('slack_only');
      }
      if (typeof payload?.baseline_window_days === 'number') {
        setWindowDays(Math.max(1, Math.min(30, Math.floor(payload.baseline_window_days))));
      }
      const resolvedZone =
        typeof payload?.time_zone === 'string' && payload.time_zone.trim().length > 0
          ? payload.time_zone.trim()
          : resolveBrowserTimeZone();
      setTimeZone(resolvedZone);
      setTimeZoneOptions((prev) => (prev.includes(resolvedZone) ? prev : [resolvedZone, ...prev]));
    } catch (err: unknown) {
      setSlackError(err instanceof Error ? err.message : 'Failed to load delivery settings');
    } finally {
      setSlackLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDeliverySettings();
  }, [loadDeliverySettings]);

  // Reload connections when switching to integrations tab
  useEffect(() => {
    if (activeTab === 'integrations' && connections.length === 0 && !loading) {
      loadConnections();
    }
  }, [activeTab, connections.length, loading, loadConnections]);

  async function connectToProvider(providerName: string) {
    setConnecting(true);
    setError('');
    setSuccess('');
    setDebugNote(null);

    try {
      if (providerName === 'github') {
        const installUrl = process.env.NEXT_PUBLIC_GITHUB_APP_INSTALL_URL;
        if (!installUrl) {
          throw new Error('GitHub App install URL is not configured.');
        }
        window.location.href = installUrl;
        return;
      }
      if (providerName === 'confluence') {
        window.location.href = '/api/oauth/confluence/start';
        return;
      }
      if (providerName === 'slack') {
        window.location.href = '/api/oauth/slack/start';
        return;
      }

      throw new Error(`${getProviderDisplayName(providerName)} integration is not available yet.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
      console.error('Connection error:', err);
      setConnecting(false);
    }
  }


  function openDisconnectModal(connectionId: string, provider: string) {
    setConnectionToDisconnect({ connectionId, provider });
    setUninstallOnDisconnect(provider === 'github');
    setDisconnectModalOpen(true);
  }

  function closeDisconnectModal() {
    setDisconnectModalOpen(false);
    setConnectionToDisconnect(null);
    setUninstallOnDisconnect(false);
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
      clearIntegrationsCache();
      await loadConnections(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    }
  }

  function getProviderDisplayName(provider: string) {
    if (provider === 'github') return 'GitHub';
    if (provider === 'slack') return 'Slack';
    if (provider === 'confluence') return 'Atlassian';
    return provider.charAt(0).toUpperCase() + provider.slice(1);
  }

  function getProviderName(provider: string) {
    if (provider === 'github') return 'GitHub';
    if (provider === 'slack') return 'Slack';
    if (provider === 'confluence') return 'Atlassian';
    return provider.charAt(0).toUpperCase() + provider.slice(1);
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function setActiveTabAndUpdateUrl(value: string) {
    const tabId = value as TabId;
    setActiveTab(tabId);
    router.push(`/settings?tab=${tabId}`, { scroll: false });
  }

  // Connection status helpers for integrations tab
  const gitHubConnection = connections.find(c => c.provider === 'github' && c.status === 'active');
  const githubInstallationId = (() => {
    const meta = gitHubConnection?.metadata;
    if (meta && typeof meta === 'object' && 'installation_id' in meta) {
      const value = Number((meta as Record<string, unknown>).installation_id);
      if (Number.isFinite(value) && value > 0) return value;
    }
    const fallback = Number(gitHubConnection?.connection_id);
    return Number.isFinite(fallback) && fallback > 0 ? fallback : null;
  })();

  async function saveSlackChannel() {
    setSlackSaving(true);
    setSlackMessage('');
    setSlackError('');
    try {
      if (!deliveryPreference) {
        throw new Error('Choose a delivery preference before saving.');
      }

      const includeSlack = deliveryPreference !== 'email_only';
      const includeEmail = deliveryPreference !== 'slack_only';

      const response = await fetch('/api/settings/delivery', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          slack_channel: includeSlack ? slackChannel.trim() || null : null,
          email_digest_enabled: includeEmail,
          email_digest_to: includeEmail ? emailDigestTo.trim() || null : null,
          delivery_preference: deliveryPreference,
          baseline_window_days: windowDays,
          time_zone: timeZone,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to save delivery settings');
      }

      setSlackMessage('Delivery settings saved.');
    } catch (err: unknown) {
      setSlackError(err instanceof Error ? err.message : 'Failed to save delivery settings');
    } finally {
      setSlackSaving(false);
    }
  }

  return (
    <>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Settings className="h-8 w-8 text-white" />
            <h1 className="text-3xl font-bold text-white">Settings</h1>
          </div>
          <p className="text-white/70">
            Manage your account settings and integrations.
          </p>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTabAndUpdateUrl} className="mb-8">
          <TabsList className="bg-zinc-800 border border-white/10">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <TabsTrigger key={tab.id} value={tab.id} className="flex items-center gap-2 data-[state=active]:bg-white/10 data-[state=active]:text-white">
                  <Icon className="h-4 w-4" />
                  {tab.name}
                </TabsTrigger>
              );
            })}
          </TabsList>
          <TabsContent value="profile" className="mt-6">
            {/* Profile Tab */}
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-white mb-2">Profile</h2>
                <p className="text-white/70">Manage your account information</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-zinc-800 p-6 backdrop-blur-sm">
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
                      <User className="h-8 w-8 text-white/70" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-white">{user?.email || 'User'}</p>
                      <p className="text-sm text-white/60">Account ID: {user?.id || 'N/A'}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-2">
                        <Mail className="inline h-4 w-4 mr-2" />
                        Email Address
                      </label>
                      <div className="rounded-lg border border-white/10 bg-zinc-800 px-4 py-3 text-white">
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
          </TabsContent>

          <TabsContent value="preferences" className="mt-6">
            {/* Preferences Tab */}
            <div className="space-y-6">
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-white mb-2">Preferences</h2>
                <p className="text-white/70">
                  Configure alert delivery and default signal analysis behavior.
                </p>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-zinc-800 p-6 backdrop-blur-sm space-y-5">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Alert Delivery</h3>
                    <p className="text-sm text-white/65">
                      Choose where daily signal alerts should go and set delivery destinations.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-white/80">
                      <span>Delivery Preference</span>
                      <TooltipProvider delayDuration={120}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 cursor-help text-white/60" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs leading-relaxed">
                            Choose where alerts are sent: Slack, Email, or Both.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Select
                      value={deliveryPreference ?? ''}
                      onValueChange={(value) =>
                        setDeliveryPreference(
                          value === 'slack_only' || value === 'email_only' || value === 'slack_then_email'
                            ? value
                            : null
                        )
                      }
                      disabled={slackLoading}
                    >
                      <SelectTrigger className="w-full border-white/20 bg-white/5 text-white">
                        <SelectValue placeholder="Choose how alerts are delivered" />
                      </SelectTrigger>
                      <SelectContent className="bg-black/90 text-white">
                        {deliveryPreferenceOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {(deliveryPreference === 'slack_only' || deliveryPreference === 'slack_then_email') && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-white/80">
                        <span>Slack Channel ID</span>
                        <TooltipProvider delayDuration={120}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-4 w-4 cursor-help text-white/60" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs leading-relaxed">
                              Enter the Slack channel for alerts. Use a channel ID like C0123456789. For private channels, invite the app first.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <Input
                        placeholder="C0123456789"
                        value={slackChannel}
                        onChange={(event) => setSlackChannel(event.target.value)}
                        disabled={slackLoading}
                        className="mt-1"
                      />
                    </div>
                  )}

                  {(deliveryPreference === 'email_only' || deliveryPreference === 'slack_then_email') && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-white/80">
                        <span>Email for Alerts</span>
                        <TooltipProvider delayDuration={120}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-4 w-4 cursor-help text-white/60" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs leading-relaxed">
                              Enter the email address for alerts. Leave blank to use your account email.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <Input
                        placeholder={initialUser?.email || 'you@company.com'}
                        value={emailDigestTo}
                        onChange={(event) => setEmailDigestTo(event.target.value)}
                        disabled={slackLoading}
                        className="mt-1"
                      />
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-white/10 bg-zinc-800 p-6 backdrop-blur-sm space-y-5">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Signal Defaults</h3>
                    <p className="text-sm text-white/65">
                      Set workspace defaults used when rendering signal windows.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-white/80">
                      <span>Time Zone</span>
                      <TooltipProvider delayDuration={120}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 cursor-help text-white/60" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs leading-relaxed">
                            Sets your workspace local time for daily alert timing and date-based views.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Select
                      value={timeZone}
                      onValueChange={(value) => setTimeZone(value)}
                      disabled={slackLoading}
                    >
                      <SelectTrigger className="w-full border-white/20 bg-white/5 text-white">
                        <SelectValue placeholder="Choose a time zone" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72 bg-black/90 text-white">
                        {timeZoneOptions.map((zone) => (
                          <SelectItem key={zone} value={zone}>
                            {zone}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-white/80">
                      <span>Signal Lookback Days</span>
                      <TooltipProvider delayDuration={120}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 cursor-help text-white/60" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs leading-relaxed">
                            Number of previous full days shown in Signals. Baseline uses the same number of days immediately before. Range: 1-30.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      max={30}
                      value={windowDays}
                      onChange={(event) =>
                        setWindowDays(Math.max(1, Math.min(30, Number(event.target.value) || 1)))
                      }
                      className="w-28 border-white/20 bg-white/5 text-white"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-zinc-800 p-6 backdrop-blur-sm space-y-4">
                  {slackError ? <p className="text-xs text-red-300">{slackError}</p> : null}
                  {slackMessage ? <p className="text-xs text-emerald-300">{slackMessage}</p> : null}

                  <div className="flex items-center gap-3">
                    <Button
                      onClick={saveSlackChannel}
                      disabled={slackSaving || slackLoading}
                      className="bg-blue-600 text-white hover:bg-blue-700"
                    >
                      {slackSaving ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving...
                        </span>
                      ) : (
                        'Save Preferences'
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="integrations" className="mt-6">
            {/* Integrations Tab */}
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
              {debugNote && (
                <div className="mb-6 rounded-lg border border-blue-500/50 bg-blue-500/10 p-4 text-blue-100">
                  <p className="text-sm">{debugNote}</p>
                </div>
              )}

              {/* Integrations */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-white">Integrations</h2>
                    <p className="text-sm text-white/60">Connect the tools you use; view and manage them in one list.</p>
                  </div>
                  {loading && (
                    <span className="flex items-center gap-2 text-sm text-white/60">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Refreshing
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  {integrationCards.map(card => {
                    const connection = connections.find(c => c.provider === card.provider);
                    const connected = connection?.status === 'active';
                    const connectedOn = connection?.created_at ? formatDate(connection.created_at) : null;

                    return (
                      <div
                        key={card.provider}
                        className="rounded-lg border border-white/10 bg-zinc-800 p-4 backdrop-blur-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/5">
                            {card.icon}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-lg font-semibold text-white">{card.name}</h3>
                              {connected && (
                                <span className="flex items-center gap-1 rounded-full bg-green-500/20 px-2 py-0.5 text-[11px] text-green-300">
                                  <Check className="h-3 w-3" />
                                  Connected
                                </span>
                              )}
                              {card.comingSoon && !connected && (
                                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/60">
                                  Coming soon
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-white/60">{card.description}</p>
                            {connectedOn && (
                              <p className="mt-1 text-xs text-white/50">Connected {connectedOn}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3 w-full sm:w-auto">
                          {connected ? (
                            <>
                              {card.provider === 'github' && (
                                <Button
                                  onClick={() => {
                                    if (githubInstallationId) {
                                      window.open(`https://github.com/settings/installations/${githubInstallationId}`, '_blank', 'noopener');
                                      return;
                                    }
                                    const installUrl = process.env.NEXT_PUBLIC_GITHUB_APP_INSTALL_URL;
                                    if (installUrl) {
                                      window.open(installUrl, '_blank', 'noopener');
                                    } else {
                                      setError('GitHub App install URL is not configured.');
                                    }
                                  }}
                                  variant="secondary"
                                  className="w-full sm:w-auto border-white/20 bg-white/10 text-white hover:bg-white/20"
                                >
                                  Manage installation
                                </Button>
                              )}
                              <Button
                                onClick={() => {
                                  if (connection) openDisconnectModal(connection.connection_id, card.provider);
                                }}
                                variant="secondary"
                                className="w-full sm:w-auto border-red-500/50 bg-red-500/10 text-red-200 hover:bg-red-500/20"
                              >
                                Disconnect
                              </Button>
                            </>
                          ) : !card.comingSoon ? (
                            <Button
                              onClick={() => connectToProvider(card.provider)}
                              disabled={connecting}
                              className="w-full sm:w-auto bg-blue-600 text-white hover:bg-blue-700"
                            >
                              {connecting ? (
                                <span className="flex items-center justify-center gap-2">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Connecting...
                                </span>
                              ) : (
                                <span className="flex items-center justify-center gap-2">
                                  <Link2 className="h-4 w-4" />
                                  {`Connect ${card.name}`}
                                </span>
                              )}
                            </Button>
                          ) : (
                            <div className="flex items-center gap-2 text-sm text-white/50">
                              <Loader2 className="h-4 w-4 animate-spin text-white/40" />
                              <span>Coming soon</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
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
            {connectionToDisconnect.provider === 'github' && (
              <label className="mb-6 flex items-start gap-3 rounded-lg border border-white/10 bg-zinc-800 p-3 text-sm text-white/70">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-red-500"
                  checked={uninstallOnDisconnect}
                  onChange={(e) => setUninstallOnDisconnect(e.target.checked)}
                />
                <span>
                  Also open GitHub to uninstall the app for this installation.
                </span>
              </label>
            )}
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={closeDisconnectModal}
                className="border-white/20 text-white/80 hover:bg-white/10"
              >
                Cancel
              </Button>
              <Button
                variant="secondary"
                className="border-red-500/50 bg-red-500/10 text-red-200 hover:bg-red-500/20"
                onClick={async () => {
                  if (connectionToDisconnect) {
                    await disconnect(connectionToDisconnect.connectionId, connectionToDisconnect.provider);
                    closeDisconnectModal();
                    if (connectionToDisconnect.provider === 'github' && uninstallOnDisconnect) {
                      if (githubInstallationId) {
                        window.open(`https://github.com/settings/installations/${githubInstallationId}`, '_blank', 'noopener');
                      } else {
                        const installUrl = process.env.NEXT_PUBLIC_GITHUB_APP_INSTALL_URL;
                        if (installUrl) {
                          window.open(installUrl, '_blank', 'noopener');
                        } else {
                          setError('GitHub App install URL is not configured.');
                        }
                      }
                    }
                  }
                }}
              >
                Disconnect
              </Button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
