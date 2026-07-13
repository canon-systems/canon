'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IntegrationSettings } from './sections/IntegrationSettings';
import { OrganizationSettings } from './sections/OrganizationSettings';
import { ProfileSettings } from './sections/ProfileSettings';
import { ReadinessSettings } from './sections/ReadinessSettings';
import { SettingsPlaceholder } from './sections/SettingsPlaceholder';
import { isSettingsTab, SettingsSidebar, type SettingsTab } from './sections/SettingsSidebar';
import { disconnectDescription, providerLabel, useIntegrations } from './hooks/useIntegrations';
import { useReadinessSettings } from './hooks/useReadinessSettings';

function integrationLogoUrl(provider: string) {
  return `/api/integrations/logo/${provider}`;
}

export function SettingsPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get('tab');
  const successParam = searchParams.get('success');
  const errorParam = searchParams.get('error');
  const activeSetting: SettingsTab = successParam === 'true' || Boolean(errorParam)
    ? 'integrations'
    : isSettingsTab(tabParam)
      ? tabParam
      : 'profile';
  const initialIntegrationSuccess = successParam === 'true'
    ? `Successfully connected to ${providerLabel(searchParams.get('provider') || 'service')}!`
    : '';
  const initialIntegrationError = errorParam
    ? 'Something went wrong connecting your integration. Please try again.'
    : '';
  const {
    connections,
    loading,
    connectingProvider,
    error,
    success,
    setError,
    disconnectModalOpen,
    connectionToDisconnect,
    connectSlack,
    connectNangoProvider,
    openDisconnectModal,
    closeDisconnectModal,
    disconnect,
  } = useIntegrations({
    initialSuccess: initialIntegrationSuccess,
    initialError: initialIntegrationError,
  });
  const readinessSettings = useReadinessSettings({
    enabled: activeSetting === 'readiness',
    setGlobalError: setError,
  });

  useEffect(() => {
    if (successParam === 'true') {
      router.replace(`/settings?tab=integrations`);
      return;
    }

    if (errorParam) {
      router.replace(`/settings?tab=integrations`);
    }
  }, [errorParam, router, successParam]);

  function formatDate(dateString: string | null) {
    if (!dateString) return 'Unknown';

    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function handleSettingsTabSelect(value: SettingsTab) {
    router.push(`/settings?tab=${value}`, { scroll: false });
  }

  const slackConnection = connections.find(c => c.provider === 'slack' && c.status === 'active');
  const granolaConnection = connections.find(c => c.provider === 'granola' && c.status === 'active');
  const teamsConnection = connections.find(c => c.provider === 'teams' && c.status === 'active');
  const gmailConnection = connections.find(c => c.provider === 'gmail' && c.status === 'active');
  const googleCalendarConnection = connections.find(c => c.provider === 'google_calendar' && c.status === 'active');
  const outlookConnection = connections.find(c => c.provider === 'outlook' && c.status === 'active');

  const integrations = [
    {
      id: 'slack',
      provider: 'slack' as const,
      name: 'Slack',
      description: 'Bring in the Slack conversations your team already uses and send updates where people already work.',
      logoUrl: integrationLogoUrl('slack'),
      connected: !!slackConnection,
      workspace: slackConnection ? `Connected ${formatDate(slackConnection.created_at)}` : '',
      action: slackConnection ? () => openDisconnectModal(slackConnection.connection_id, 'slack') : connectSlack,
    },
    {
      id: 'granola',
      provider: 'granola' as const,
      name: 'Granola',
      description: 'Use meeting notes and transcripts to spot customer themes and team follow-up work.',
      logoUrl: integrationLogoUrl('granola'),
      connected: !!granolaConnection,
      workspace: granolaConnection ? `Connected ${formatDate(granolaConnection.created_at)}` : '',
      action: granolaConnection
        ? () => openDisconnectModal(granolaConnection.connection_id, 'granola')
        : () => connectNangoProvider('granola'),
    },
    {
      id: 'teams',
      provider: 'teams' as const,
      name: 'Microsoft Teams',
      description: 'Bring in Teams conversations so Canon can keep guidance tied to what your teams discuss every day.',
      logoUrl: integrationLogoUrl('teams'),
      connected: !!teamsConnection,
      workspace: teamsConnection ? `Connected ${formatDate(teamsConnection.created_at)}` : '',
      action: teamsConnection
        ? () => openDisconnectModal(teamsConnection.connection_id, 'teams')
        : () => connectNangoProvider('teams'),
    },
    {
      id: 'gmail',
      provider: 'gmail' as const,
      name: 'Gmail',
      description: 'Connect email conversations so Canon can understand customer and team context from Gmail.',
      logoUrl: integrationLogoUrl('gmail'),
      connected: !!gmailConnection,
      workspace: gmailConnection ? `Connected ${formatDate(gmailConnection.created_at)}` : '',
      action: gmailConnection
        ? () => openDisconnectModal(gmailConnection.connection_id, 'gmail')
        : () => connectNangoProvider('gmail'),
    },
    {
      id: 'google-calendar',
      provider: 'google_calendar' as const,
      name: 'Google Calendar',
      description: 'Connect calendar events so Canon can understand meetings, timing, and handoffs.',
      logoUrl: integrationLogoUrl('google_calendar'),
      connected: !!googleCalendarConnection,
      workspace: googleCalendarConnection ? `Connected ${formatDate(googleCalendarConnection.created_at)}` : '',
      action: googleCalendarConnection
        ? () => openDisconnectModal(googleCalendarConnection.connection_id, 'google_calendar')
        : () => connectNangoProvider('google_calendar'),
    },
    {
      id: 'outlook',
      provider: 'outlook' as const,
      name: 'Outlook',
      description: 'Connect Outlook messages so Canon can use customer and internal email context.',
      logoUrl: integrationLogoUrl('outlook'),
      connected: !!outlookConnection,
      workspace: outlookConnection ? `Connected ${formatDate(outlookConnection.created_at)}` : '',
      action: outlookConnection
        ? () => openDisconnectModal(outlookConnection.connection_id, 'outlook')
        : () => connectNangoProvider('outlook'),
    },
  ];
  const connectedIntegrations = integrations.filter((integration) => integration.connected);
  const availableIntegrations = integrations.filter((integration) => !integration.connected);

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="app-page-header border-b">
          <h1 className="type-page-title" style={{ color: 'var(--text-primary)' }}>Settings</h1>
          <p className="type-page-subtitle mt-[2px]" style={{ color: 'var(--text-tertiary)' }}>Manage the roles, sources, and integrations behind team readiness</p>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <SettingsSidebar activeSetting={activeSetting} onSelect={handleSettingsTabSelect} />

          <div className="surface-page flex-1 overflow-y-auto px-7 py-6">
            {activeSetting === 'profile' && <ProfileSettings />}
            {activeSetting === 'integrations' && (
              <IntegrationSettings
                integrations={connectedIntegrations}
                availableIntegrations={availableIntegrations}
                loading={loading}
                connectingProvider={connectingProvider}
                success={success}
                error={error}
              />
            )}
            {activeSetting === 'readiness' && <ReadinessSettings readinessSettings={readinessSettings} />}
            {activeSetting === 'delete' && <SettingsPlaceholder label="Delete Account" />}
            {activeSetting === 'org' && <OrganizationSettings />}
            {activeSetting === 'apikeys' && <SettingsPlaceholder label="API Keys" />}
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

    </>
  );
}
