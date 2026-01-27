'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Settings, User, Link2, Mail, Check, Loader2, Github } from 'lucide-react';
import { IntegrationLogos } from '@/components/IntegrationLogos';
import { getIntegrationsCached, clearIntegrationsCache } from '@/lib/client/integrationsCache';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

interface Connection {
  id: string;
  provider: string;
  connection_id: string;
  status: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

type TabId = 'profile' | 'integrations';

// Repository and automation types moved to /automation page

interface SettingsPageClientProps {
  user: SupabaseUser | null;
}

const tabs: Array<{ id: TabId; name: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'profile', name: 'Profile', icon: User },
  { id: 'integrations', name: 'Integrations', icon: Link2 }
];

export function SettingsPageClient({ user: initialUser }: SettingsPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false);
  const [connectionToDisconnect, setConnectionToDisconnect] = useState<{ connectionId: string; provider: string } | null>(null);
  const [uninstallOnDisconnect, setUninstallOnDisconnect] = useState(false);

  // Repository management moved to /automation page

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
    const validTabs: TabId[] = ['profile', 'integrations'];
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
  }, [searchParams, router, activeTab, loadConnections]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

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

    try {
      if (providerName === 'github') {
        const installUrl = process.env.NEXT_PUBLIC_GITHUB_APP_INSTALL_URL;
        if (!installUrl) {
          throw new Error('GitHub App install URL is not configured.');
        }
        window.location.href = installUrl;
        return;
      }
      if (providerName === 'notion') {
        window.location.href = '/api/oauth/notion/start';
        return;
      }
      if (providerName === 'confluence') {
        window.location.href = '/api/oauth/confluence/start';
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

  function setActiveTabAndUpdateUrl(value: string) {
    const tabId = value as TabId;
    setActiveTab(tabId);
    router.push(`/settings?tab=${tabId}`, { scroll: false });
  }

  // Automation functionality moved to /automation page

  // Repository management moved to /automation page

  // Automation functionality moved to /automation page
  // All automation-related functions removed

  // Repository management moved to /automation page

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
          <TabsList className="bg-white/5 border border-white/10">
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
                  {[
                    {
                      provider: 'github',
                      name: 'GitHub',
                      description: 'Install our GitHub App to sync repos and PR context.',
                      icon: <Github className="h-7 w-7 text-white" />
                    },
                    {
                      provider: 'notion',
                      name: 'Notion',
                      description: 'Sync pages and databases for richer answers.',
                      icon: <IntegrationLogos provider="notion" size={28} />
                    },
                    {
                      provider: 'confluence',
                      name: 'Confluence',
                      description: 'Keep your Confluence spaces searchable and fresh.',
                      icon: <IntegrationLogos provider="confluence" size={28} />
                    },
                    {
                      provider: 'googledocs',
                      name: 'Google Docs',
                      description: 'Bring docs into canon. Coming soon.',
                      icon: <IntegrationLogos provider="google-docs" size={28} />,
                      comingSoon: true
                    }
                  ].map(card => {
                    const connection = connections.find(c => c.provider === card.provider);
                    const connected = connection?.status === 'active';
                    const connectedOn = connection?.created_at ? formatDate(connection.created_at) : null;

                    return (
                      <div
                        key={card.provider}
                        className="rounded-lg border border-white/10 bg-white/5 p-4 backdrop-blur-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
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
              <label className="mb-6 flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/70">
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
