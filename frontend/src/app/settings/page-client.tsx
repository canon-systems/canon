'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Settings, User, Link2, Mail, Check, Loader2 } from 'lucide-react';
import { IntegrationLogos } from '@/components/IntegrationLogos';
import { getIntegrationsCached, clearIntegrationsCache } from '@/lib/client/integrationsCache';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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
  const [user] = useState<SupabaseUser | null>(initialUser);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false);
  const [connectionToDisconnect, setConnectionToDisconnect] = useState<{ connectionId: string; provider: string } | null>(null);

  const loadConnections = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const data = await getIntegrationsCached(force);
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

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const validTabs: TabId[] = ['profile', 'integrations'];
    if (tabParam && validTabs.includes(tabParam as TabId)) {
      setActiveTab(tabParam as TabId);
    }

    const successParam = searchParams.get('success');
    const errorParam = searchParams.get('error');
    if (successParam === 'true') {
      const provider = searchParams.get('provider') || 'service';
      setSuccess(`Successfully connected to ${provider}!`);
      router.replace(`/settings?tab=integrations`);
      setActiveTab('integrations');
    }
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
      router.replace(`/settings?tab=integrations`);
      setActiveTab('integrations');
    }
  }, [searchParams, router]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  async function connectSlack() {
    setConnecting(true);
    setError('');
    setSuccess('');
    try {
      window.location.href = '/api/oauth/slack/start';
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
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
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || 'Failed to disconnect');
      }

      setSuccess(`Disconnected from Slack`);
      clearIntegrationsCache();
      await loadConnections(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    }
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

  const slackConnection = connections.find(c => c.provider === 'slack' && c.status === 'active');

  return (
    <>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Settings className="h-8 w-8 text-white" />
            <h1 className="text-3xl font-bold text-white">Settings</h1>
          </div>
          <p className="text-white/70">Manage your account and Slack integration.</p>
        </div>

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
            <div className="rounded-xl border border-white/10 bg-zinc-800 p-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
                  <User className="h-8 w-8 text-white/70" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-white">{user?.email || 'User'}</p>
                  <p className="text-sm text-white/60">Account ID: {user?.id || 'N/A'}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  <Mail className="inline h-4 w-4 mr-2" />
                  Email Address
                </label>
                <div className="rounded-lg border border-white/10 bg-zinc-900 px-4 py-3 text-white">
                  {user?.email || 'Not available'}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="integrations" className="mt-6">
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
                <p className="text-sm">{error}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-white mb-1">Slack workspace</h2>
                <p className="text-sm text-white/60">Connect your Slack workspace so Canon can send onboarding DMs to new hires.</p>
              </div>

              <div className="rounded-lg border border-white/10 bg-zinc-800 p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/5">
                    <IntegrationLogos provider="slack" size={28} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-white">Slack</h3>
                      {slackConnection && (
                        <span className="flex items-center gap-1 rounded-full bg-green-500/20 px-2 py-0.5 text-[11px] text-green-300">
                          <Check className="h-3 w-3" />
                          Connected
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-white/60">Connect Slack to enable Canon&apos;s onboarding DMs and knowledge sync.</p>
                    {slackConnection && (
                      <p className="mt-1 text-xs text-white/50">Connected {formatDate(slackConnection.created_at)}</p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 sm:flex-col">
                  {slackConnection ? (
                    <Button
                      onClick={() => openDisconnectModal(slackConnection.connection_id, 'slack')}
                      variant="secondary"
                      className="border-red-500/50 bg-red-500/10 text-red-200 hover:bg-red-500/20"
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      onClick={connectSlack}
                      disabled={connecting}
                      className="bg-blue-600 text-white hover:bg-blue-700"
                    >
                      {connecting ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Connecting...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Link2 className="h-4 w-4" />
                          Connect Slack
                        </span>
                      )}
                    </Button>
                  )}
                </div>
              </div>

              {loading && (
                <div className="flex items-center gap-2 text-sm text-white/50">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading integration status...
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={disconnectModalOpen && connectionToDisconnect !== null} onOpenChange={(open) => !open && closeDisconnectModal()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Disconnect Slack</DialogTitle>
            <DialogDescription>
              Are you sure you want to disconnect Slack? Canon will no longer be able to send DMs to new hires.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={closeDisconnectModal} className="border-white/20 text-white/80 hover:bg-white/10">
              Cancel
            </Button>
            <Button
              variant="secondary"
              className="border-red-500/50 bg-red-500/10 text-red-200 hover:bg-red-500/20"
              onClick={async () => {
                if (connectionToDisconnect) {
                  await disconnect(connectionToDisconnect.connectionId, connectionToDisconnect.provider);
                  closeDisconnectModal();
                }
              }}
            >
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
