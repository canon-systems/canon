'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  IconActivity,
  IconBell,
  IconBuilding,
  IconKey,
  IconLoader2,
  IconPlug,
  IconSparkles,
  IconTrash,
  IconUser,
} from '@tabler/icons-react';
import { IntegrationLogos } from '@/components/IntegrationLogos';
import { getIntegrationsCached, clearIntegrationsCache } from '@/lib/client/integrationsCache';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar } from '@/components/ui/avatar';

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
      { id: 'logs', label: 'Usage Logs', icon: IconActivity },
      { id: 'placeholders', label: 'Placeholder Values', icon: IconSparkles },
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
  const [demoSeeded, setDemoSeeded] = useState(false);
  const [demoToggling, setDemoToggling] = useState(false);

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
    fetch('/api/seed-demo')
      .then((r) => r.json())
      .then((d: { seeded?: boolean }) => setDemoSeeded(d.seeded ?? false))
      .catch(() => null);
  }, [loadConnections]);

  async function toggleDemo() {
    setDemoToggling(true);
    try {
      await fetch('/api/seed-demo', { method: demoSeeded ? 'DELETE' : 'POST' });
      const res = await fetch('/api/seed-demo');
      const d = (await res.json()) as { seeded?: boolean };
      setDemoSeeded(d.seeded ?? false);
    } finally {
      setDemoToggling(false);
    }
  }

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

      setSuccess(`Disconnected from Slack`);
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
  const displayName = (user?.user_metadata?.full_name as string | undefined) ?? user?.email?.split('@')[0] ?? 'User';

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
  ];

  function renderProfile() {
    return (
      <div className="max-w-2xl">
        <div className="rounded-[10px] px-[18px] py-4 flex items-center gap-[14px] mb-4 border" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-tertiary)' }}>
          <Avatar name={user?.email ?? 'User'} size="lg" />
          <div>
            <div className="type-card-title" style={{ color: 'var(--text-primary)' }}>{displayName}</div>
            <div className="type-page-subtitle mt-[2px]" style={{ color: 'var(--text-secondary)' }}>{user?.email || 'Not Available'}</div>
            <div className="type-caption mt-[2px] font-mono" style={{ color: 'var(--text-tertiary)' }}>{user?.id || 'N/A'}</div>
          </div>
        </div>

        {[
          { label: 'Display Name', value: displayName, hint: 'This is shown inside Canon.' },
          { label: 'Email', value: user?.email || '', hint: 'Email is managed by your authentication provider.' },
        ].map((field) => (
          <div key={field.label} className="mb-[14px]">
            <label className="block type-body font-medium mb-[5px]" style={{ color: 'var(--text-secondary)' }}>
              {field.label}
            </label>
            <input
              value={field.value}
              readOnly
              className="w-full px-3 py-2 rounded-[7px] type-field border outline-none transition-all duration-[120ms]"
              style={{
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                borderColor: 'var(--border-secondary)',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--canon-purple)';
                e.target.style.boxShadow = '0 0 0 3px var(--focus-ring)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--border-secondary)';
                e.target.style.boxShadow = 'none';
              }}
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
          <div className="mb-4 rounded-[8px] border px-[14px] py-3 type-body-strong" style={{ backgroundColor: 'var(--green-bg)', borderColor: 'var(--green-border)', color: 'var(--green-text)' }}>
            {success}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-[8px] border px-[14px] py-3 type-body-strong" style={{ backgroundColor: 'var(--red-bg)', borderColor: 'var(--red-border)', color: 'var(--red-text)' }}>
            {error}
          </div>
        )}

        {integrations.map((int) => (
          <div key={int.id} className="rounded-[10px] px-4 py-[14px] flex items-center gap-[14px] mb-[10px] border" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-tertiary)' }}>
            <div className="w-9 h-9 rounded-[9px] flex items-center justify-center flex-shrink-0" style={{ backgroundColor: int.iconBg, color: int.iconColor }}>
              <IntegrationLogos provider={int.provider} size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="type-section-title" style={{ color: 'var(--text-primary)' }}>{int.name}</div>
              <div className="type-body mt-[2px]" style={{ color: 'var(--text-secondary)' }}>{int.description}</div>
              <div className="flex items-center gap-[5px] mt-1">
                <div className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: int.connected ? 'var(--green)' : 'var(--border-secondary)' }} />
                <span className="type-caption" style={{ color: int.connected ? 'var(--green-text)' : 'var(--text-tertiary)' }}>
                  {int.connected ? `Connected · ${int.workspace}` : 'Not Connected'}
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
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 type-body" style={{ color: 'var(--text-tertiary)' }}>
            <IconLoader2 size={14} className="animate-spin" /> Loading Integration Status...
          </div>
        )}
      </div>
    );
  }

  function renderPlaceholderValues() {
    return (
      <div className="max-w-3xl">
        <div className="mb-4">
          <h2 className="type-page-title" style={{ color: 'var(--text-primary)' }}>Placeholder Values</h2>
          <p className="type-page-subtitle mt-[2px]" style={{ color: 'var(--text-tertiary)' }}>
            Toggle sample onboarding data for UI review and local testing.
          </p>
        </div>

        <div className="rounded-[10px] px-4 py-[14px] flex items-center gap-[14px] border" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-tertiary)' }}>
          <div className="w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--canon-purple-light)' }}>
            {demoToggling ? (
              <IconLoader2 size={15} className="animate-spin" style={{ color: 'var(--canon-purple)' }} />
            ) : (
              <IconSparkles size={15} style={{ color: 'var(--canon-purple)' }} />
            )}
          </div>
          <div className="flex-1">
            <div className="type-panel-title" style={{ color: 'var(--text-primary)' }}>{demoSeeded ? 'Clear Placeholder Values' : 'Load Placeholder Values'}</div>
            <div className="type-body mt-[2px]" style={{ color: 'var(--text-secondary)' }}>
              {demoSeeded
                ? 'Remove sample hires, deliveries, access requests, milestones, and readiness notes loaded for testing.'
                : 'Load sample hires, deliveries, access requests, milestones, and readiness notes for testing.'}
            </div>
          </div>
          <Button variant={demoSeeded ? 'destructive' : 'secondary'} onClick={toggleDemo} disabled={demoToggling}>
            {demoToggling ? <IconLoader2 size={13} className="animate-spin" /> : <IconSparkles size={13} />}
            {demoToggling ? 'Working...' : demoSeeded ? 'Clear Values' : 'Load Values'}
          </Button>
        </div>
      </div>
    );
  }

  function renderPlaceholder(label: string) {
    return (
      <div className="max-w-2xl rounded-[10px] border px-5 py-8 text-center" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-tertiary)' }}>
        <div className="type-section-title" style={{ color: 'var(--text-secondary)' }}>{label}</div>
        <div className="type-body mt-2" style={{ color: 'var(--text-tertiary)' }}>This settings section is ready for configuration content.</div>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b" style={{ borderColor: 'var(--border-tertiary)' }}>
          <h1 className="type-page-title" style={{ color: 'var(--text-primary)' }}>Settings</h1>
          <p className="type-page-subtitle mt-[2px]" style={{ color: 'var(--text-tertiary)' }}>Manage Your Account and Workspace Connections</p>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-shrink-0 py-5 overflow-y-auto border-r" style={{ width: 180, borderColor: 'var(--border-tertiary)' }}>
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
                      className="flex w-[calc(100%-16px)] items-center gap-2 px-4 py-[7px] text-left type-nav mx-2 rounded-[5px] cursor-pointer transition-colors duration-[120ms]"
                      style={{
                        backgroundColor: activeSetting === item.id ? 'var(--canon-purple-light)' : 'transparent',
                        color: danger ? 'var(--red-text)' : activeSetting === item.id ? 'var(--canon-purple-dark)' : 'var(--text-secondary)',
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

          <div className="flex-1 overflow-y-auto px-7 py-6">
            {activeSetting === 'profile' && renderProfile()}
            {activeSetting === 'integrations' && renderIntegrations()}
            {activeSetting === 'placeholders' && renderPlaceholderValues()}
            {activeSetting === 'delete' && renderPlaceholder('Delete Account')}
            {activeSetting === 'org' && renderPlaceholder('Organization')}
            {activeSetting === 'notifications' && renderPlaceholder('Notifications')}
            {activeSetting === 'apikeys' && renderPlaceholder('API Keys')}
            {activeSetting === 'logs' && renderPlaceholder('Usage Logs')}
          </div>
        </div>
      </div>

      <Dialog open={disconnectModalOpen && connectionToDisconnect !== null} onOpenChange={(open) => !open && closeDisconnectModal()}>
        <DialogContent className="max-w-md border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle>Disconnect Slack</DialogTitle>
            <DialogDescription>
              Are you sure you want to disconnect Slack? Canon will no longer be able to send DMs to new hires.
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
    </>
  );
}
