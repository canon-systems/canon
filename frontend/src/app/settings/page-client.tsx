'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  IconBell,
  IconBuilding,
  IconKey,
  IconLoader2,
  IconPlug,
  IconTrash,
  IconUser,
} from '@tabler/icons-react';
import { IntegrationLogos } from '@/components/IntegrationLogos';
import { getIntegrationsCached, clearIntegrationsCache } from '@/lib/client/integrationsCache';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/components/ui/utils';

interface Connection {
  id: string;
  provider: string;
  connection_id: string;
  status: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface SettingsPageClientProps {
  user: SupabaseUser | null;
}

const settingSections = [
  { section: 'Account', items: [{ id: 'profile', label: 'Profile', icon: IconUser }, { id: 'org', label: 'Organization', icon: IconBuilding }] },
  { section: 'Connections', items: [{ id: 'integrations', label: 'Integrations', icon: IconPlug }, { id: 'notifications', label: 'Notifications', icon: IconBell }] },
  {
    section: 'Developer',
    items: [
      { id: 'apikeys', label: 'API Keys', icon: IconKey },
    ],
  },
  { section: 'Danger', items: [{ id: 'delete', label: 'Delete Account', icon: IconTrash, danger: true }] },
];

export function SettingsPageClient({ user: initialUser }: SettingsPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeSetting, setActiveSetting] = useState('profile');
  const [user] = useState<SupabaseUser | null>(initialUser);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false);
  const [connectionToDisconnect, setConnectionToDisconnect] = useState<{ connectionId: string; provider: string } | null>(null);
  const [gongModalOpen, setGongModalOpen] = useState(false);
  const [gongAccessKey, setGongAccessKey] = useState('');
  const [gongAccessKeySecret, setGongAccessKeySecret] = useState('');
  const [gongApiBaseUrl, setGongApiBaseUrl] = useState('https://api.gong.io');

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
      setError(err instanceof Error ? err.message : 'Failed to Load Connections');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const validTabs = ['profile', 'integrations'];
    if (tabParam && validTabs.includes(tabParam)) {
      setActiveSetting(tabParam);
    }

    const successParam = searchParams.get('success');
    const errorParam = searchParams.get('error');
    if (successParam === 'true') {
      const provider = searchParams.get('provider') || 'service';
      setSuccess(`Successfully connected to ${provider}!`);
      router.replace(`/settings?tab=integrations`);
      setActiveSetting('integrations');
    }
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
      router.replace(`/settings?tab=integrations`);
      setActiveSetting('integrations');
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
      setError(err instanceof Error ? err.message : 'Failed to Connect');
      setConnecting(false);
    }
  }

  async function connectGong() {
    setConnecting(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/integrations/gong/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accessKey: gongAccessKey,
          accessKeySecret: gongAccessKeySecret,
          apiBaseUrl: gongApiBaseUrl,
        }),
      });

      const data = (await response.json()) as { error?: string; detail?: string };
      if (!response.ok) {
        throw new Error(data.error || data.detail || 'Failed to connect Gong');
      }

      setSuccess('Successfully connected to Gong');
      setGongModalOpen(false);
      setGongAccessKey('');
      setGongAccessKeySecret('');
      setGongApiBaseUrl('https://api.gong.io');
      clearIntegrationsCache();
      await loadConnections(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to connect Gong');
    } finally {
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
        throw new Error(data.error || 'Failed to Disconnect');
      }

      setSuccess(`Disconnected from ${providerLabel(provider)}`);
      clearIntegrationsCache();
      await loadConnections(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to Disconnect');
    }
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function setActiveSettingAndUpdateUrl(value: string) {
    setActiveSetting(value);
    if (value === 'profile' || value === 'integrations') {
      router.push(`/settings?tab=${value}`, { scroll: false });
    }
  }

  const slackConnection = connections.find(c => c.provider === 'slack' && c.status === 'active');
  const gongConnection = connections.find(c => c.provider === 'gong' && c.status === 'active');
  const displayName = (user?.user_metadata?.full_name as string | undefined) ?? user?.email?.split('@')[0] ?? 'User';

  function providerLabel(provider: string) {
    if (provider === 'gong') return 'Gong';
    if (provider === 'slack') return 'Slack';
    return provider.charAt(0).toUpperCase() + provider.slice(1);
  }

  function disconnectDescription(provider: string) {
    if (provider === 'gong') {
      return 'Canon will stop syncing Gong calls and remove Gong knowledge sources.';
    }
    if (provider === 'slack') {
      return 'Canon will no longer be able to send DMs or sync Slack channel knowledge.';
    }
    return 'Canon will remove connected knowledge sources for this integration.';
  }

  const integrations = [
    {
      id: 'slack',
      provider: 'slack' as const,
      name: 'Slack',
      description: 'Send onboarding DMs and sync channel knowledge.',
      iconBg: 'var(--slack-bg)',
      iconColor: 'var(--slack-text)',
      connected: !!slackConnection,
      workspace: slackConnection ? `Connected ${formatDate(slackConnection.created_at)}` : '',
      action: slackConnection ? () => openDisconnectModal(slackConnection.connection_id, 'slack') : connectSlack,
    },
    {
      id: 'gong',
      provider: 'gong' as const,
      name: 'Gong',
      description: 'Sync customer call transcripts as onboarding knowledge.',
      iconBg: 'var(--gong-bg)',
      iconColor: 'var(--gong-text)',
      connected: !!gongConnection,
      workspace: gongConnection ? `Connected ${formatDate(gongConnection.created_at)}` : '',
      action: gongConnection ? () => openDisconnectModal(gongConnection.connection_id, 'gong') : () => setGongModalOpen(true),
    },
  ];

  function renderProfile() {
    return (
      <div className="max-w-2xl">
        <Card className="mb-4 flex items-center gap-[14px] px-[18px] py-4">
          <Avatar name={user?.email ?? 'User'} size="lg" />
          <div>
            <div className="type-card-title" style={{ color: 'var(--text-primary)' }}>{displayName}</div>
            <div className="type-page-subtitle mt-[2px]" style={{ color: 'var(--text-secondary)' }}>{user?.email || 'Not Available'}</div>
            <div className="type-caption mt-[2px] font-mono" style={{ color: 'var(--text-tertiary)' }}>{user?.id || 'N/A'}</div>
          </div>
        </Card>

        {[
          { label: 'Display Name', value: displayName, hint: 'This is shown inside Canon.' },
          { label: 'Email', value: user?.email || '', hint: 'Email is managed by your authentication provider.' },
        ].map((field) => (
          <div key={field.label} className="mb-[14px]">
            <label className="block type-body font-medium mb-[5px]" style={{ color: 'var(--text-secondary)' }}>
              {field.label}
            </label>
            <Input
              value={field.value}
              readOnly
            />
            <p className="type-caption mt-1" style={{ color: 'var(--text-tertiary)' }}>{field.hint}</p>
          </div>
        ))}
        <div className="flex justify-end mt-1"><Button>Save Changes</Button></div>
      </div>
    );
  }

  function renderIntegrations() {
    return (
      <div className="max-w-3xl">
        {success && (
          <Alert variant="success" className="mb-4 type-body-strong">
            {success}
          </Alert>
        )}
        {error && (
          <Alert variant="destructive" className="mb-4 type-body-strong">
            {error}
          </Alert>
        )}

        {integrations.map((int) => {
          return (
          <Card key={int.id} className="mb-[10px] flex items-center gap-[14px] px-4 py-[14px]">
            <div className="w-9 h-9 rounded-[9px] flex items-center justify-center flex-shrink-0" style={{ backgroundColor: int.iconBg, color: int.iconColor }}>
              <IntegrationLogos provider={int.provider} size={22} color={int.iconColor} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="type-section-title" style={{ color: 'var(--text-primary)' }}>{int.name}</div>
              <div className="type-body mt-[2px]" style={{ color: 'var(--text-secondary)' }}>{int.description}</div>
              <div className="flex items-center gap-[5px] mt-1">
                <div className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: int.connected ? 'var(--green)' : 'var(--border-secondary)' }} />
                <span className="type-caption" style={{ color: int.connected ? 'var(--green-text)' : 'var(--text-tertiary)' }}>
                  {int.connected ? `Active · ${int.workspace}` : 'Not Connected'}
                </span>
              </div>
            </div>
            {int.connected ? (
              <Button variant="destructive" onClick={int.action}>Disconnect</Button>
            ) : (
              <Button variant="secondary" onClick={int.action} disabled={connecting}>
                {connecting ? <IconLoader2 size={13} className="animate-spin" /> : <IconPlug size={13} />}
                Connect
              </Button>
            )}
          </Card>
          );
        })}

        {loading && (
          <div className="flex items-center gap-2 type-body" style={{ color: 'var(--text-tertiary)' }}>
            <IconLoader2 size={14} className="animate-spin" /> Loading Integration Status...
          </div>
        )}
      </div>
    );
  }

  function renderPlaceholder(label: string) {
    return (
      <Card className="max-w-2xl px-5 py-8 text-center">
        <div className="type-section-title" style={{ color: 'var(--text-secondary)' }}>{label}</div>
        <div className="type-body mt-2" style={{ color: 'var(--text-tertiary)' }}>This settings section is ready for configuration content.</div>
      </Card>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="surface-divider px-6 pt-5 pb-4 border-b">
          <h1 className="type-page-title" style={{ color: 'var(--text-primary)' }}>Settings</h1>
          <p className="type-page-subtitle mt-[2px]" style={{ color: 'var(--text-tertiary)' }}>Manage Your Account and Workspace Connections</p>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="split-sidebar w-[180px] flex-shrink-0 py-5 overflow-y-auto border-r">
            {settingSections.map(({ section, items }) => (
              <div key={section}>
                <div className="type-kicker px-4 pt-[10px] pb-1" style={{ color: 'var(--text-tertiary)' }}>
                  {section}
                </div>
                {items.map((item) => {
                  const Icon = item.icon;
                  const danger = 'danger' in item && item.danger;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveSettingAndUpdateUrl(item.id)}
                      className={cn(
                        'flex w-[calc(100%-16px)] items-center gap-2 px-4 py-[7px] text-left type-nav mx-2 rounded-[5px] cursor-pointer border border-transparent transition-colors duration-[120ms]',
                        activeSetting === item.id && 'nav-item-selected'
                      )}
                      style={{
                        color: danger ? 'var(--red-text)' : activeSetting === item.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                        fontWeight: activeSetting === item.id ? 500 : 400,
                      }}
                    >
                      <Icon size={14} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="surface-page flex-1 overflow-y-auto px-7 py-6">
            {activeSetting === 'profile' && renderProfile()}
            {activeSetting === 'integrations' && renderIntegrations()}
            {activeSetting === 'delete' && renderPlaceholder('Delete Account')}
            {activeSetting === 'org' && renderPlaceholder('Organization')}
            {activeSetting === 'notifications' && renderPlaceholder('Notifications')}
            {activeSetting === 'apikeys' && renderPlaceholder('API Keys')}
          </div>
        </div>
      </div>

      <Dialog open={disconnectModalOpen && connectionToDisconnect !== null} onOpenChange={(open) => !open && closeDisconnectModal()}>
        <DialogContent className="max-w-md border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle>Disconnect {connectionToDisconnect ? providerLabel(connectionToDisconnect.provider) : 'Integration'}</DialogTitle>
            <DialogDescription>
              {connectionToDisconnect ? disconnectDescription(connectionToDisconnect.provider) : 'Canon will remove this integration.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={closeDisconnectModal}>
              Cancel
            </Button>
            <Button
              variant="destructive"
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

      <Dialog open={gongModalOpen} onOpenChange={setGongModalOpen}>
        <DialogContent className="max-w-md border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle>Connect Gong</DialogTitle>
            <DialogDescription>
              Add a Gong access key and secret so Canon can sync recent call transcripts.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <label className="block type-body font-medium mb-[5px]" style={{ color: 'var(--text-secondary)' }} htmlFor="gong-access-key">
                Access Key
              </label>
              <Input
                id="gong-access-key"
                value={gongAccessKey}
                onChange={(event) => setGongAccessKey(event.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block type-body font-medium mb-[5px]" style={{ color: 'var(--text-secondary)' }} htmlFor="gong-access-key-secret">
                Access Key Secret
              </label>
              <Input
                id="gong-access-key-secret"
                type="password"
                value={gongAccessKeySecret}
                onChange={(event) => setGongAccessKeySecret(event.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block type-body font-medium mb-[5px]" style={{ color: 'var(--text-secondary)' }} htmlFor="gong-api-base-url">
                API Base URL
              </label>
              <Input
                id="gong-api-base-url"
                value={gongApiBaseUrl}
                onChange={(event) => setGongApiBaseUrl(event.target.value)}
                autoComplete="off"
              />
              <p className="type-caption mt-1" style={{ color: 'var(--text-tertiary)' }}>Use the default unless your Gong workspace has a regional API host.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setGongModalOpen(false)} disabled={connecting}>
              Cancel
            </Button>
            <Button onClick={connectGong} disabled={connecting || !gongAccessKey.trim() || !gongAccessKeySecret.trim()}>
              {connecting ? <IconLoader2 size={13} className="animate-spin" /> : <IconPlug size={13} />}
              Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
