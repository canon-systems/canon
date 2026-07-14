'use client';

import { useCallback, useEffect, useState } from 'react';
import Nango, { type ConnectUIEvent } from '@nangohq/frontend';
import { toast } from 'sonner';

import { clearIntegrationsCache, getIntegrationsCached } from '@/lib/client/integrationsCache';

export interface Connection {
  id: string;
  provider: string;
  connection_id: string;
  status: string;
  metadata?: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

export function providerLabel(provider: string) {
  if (provider === 'slack') return 'Slack';
  if (provider === 'granola') return 'Granola';
  if (provider === 'teams') return 'Microsoft Teams';
  if (provider === 'google_chat') return 'Google Chat';
  if (provider === 'gmail') return 'Gmail';
  if (provider === 'google_calendar') return 'Google Calendar';
  if (provider === 'outlook') return 'Outlook';
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

export function disconnectDescription(provider: string) {
  if (provider === 'slack') return 'Canon will stop using Slack conversations and will no longer send Slack updates.';
  if (provider === 'granola') return 'Canon will stop using Granola meetings and transcripts.';
  if (provider === 'teams') return 'Canon will stop using Microsoft Teams conversations.';
  if (provider === 'google_chat') return 'Canon will stop using Google Chat conversations and delivery targets.';
  if (provider === 'gmail') return 'Canon will stop using Gmail messages.';
  if (provider === 'google_calendar') return 'Canon will stop using Google Calendar events.';
  if (provider === 'outlook') return 'Canon will stop using Outlook messages.';
  return `Canon will stop using ${providerLabel(provider)}.`;
}

type UseIntegrationsParams = {
  initialSuccess?: string;
  initialError?: string;
};

export function useIntegrations(params: UseIntegrationsParams = {}) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [error, setError] = useState(params.initialError ?? '');
  const [success, setSuccess] = useState(params.initialSuccess ?? '');
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
        created_at: typeof conn.created_at === 'string' ? conn.created_at : null,
        updated_at: typeof conn.updated_at === 'string' ? conn.updated_at : null,
      }));
      setConnections(mappedConnections);
    } catch {
      setError('Unable to load your integrations. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  async function connectSlack() {
    setConnectingProvider('slack');
    try {
      window.location.href = '/api/oauth/slack/start';
    } catch {
      toast.error('Unable to connect Slack right now. Please try again.');
      setConnectingProvider(null);
    }
  }

  async function connectNangoProvider(provider: string) {
    setConnectingProvider(provider);
    try {
      const response = await fetch('/api/integrations/nango/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        token?: string;
        error?: string;
        detail?: string;
      };
      if (!response.ok || !data.token) {
        throw new Error(data.detail || data.error || 'connect_failed');
      }

      let connected = false;
      let connectUI: ReturnType<Nango['openConnectUI']> | null = null;
      const nango = new Nango();

      connectUI = nango.openConnectUI({
        sessionToken: data.token,
        onEvent: async (event: ConnectUIEvent) => {
          if (event.type === 'connect') {
            connected = true;
            connectUI?.close();
            clearIntegrationsCache();
            window.location.href = `/settings?tab=integrations&success=true&provider=${encodeURIComponent(provider)}`;
            return;
          }

          if (event.type === 'error') {
            connectUI?.close();
            setConnectingProvider(null);
            toast.error(`Unable to connect ${providerLabel(provider)} right now. Please try again.`);
            return;
          }

          if (event.type === 'close' && !connected) {
            setConnectingProvider(null);
          }
        },
      });
    } catch {
      toast.error(`Unable to connect ${providerLabel(provider)} right now. Please try again.`);
      setConnectingProvider(null);
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
        body: JSON.stringify({ connectionId, provider }),
      });

      if (!response.ok) throw new Error('disconnect');

      toast.success(`Disconnected from ${providerLabel(provider)}`);
      clearIntegrationsCache();
      await loadConnections(true);
    } catch {
      toast.error('Something went wrong disconnecting. Please try again.');
    }
  }

  return {
    connections,
    loading,
    connectingProvider,
    error,
    success,
    setError,
    setSuccess,
    disconnectModalOpen,
    connectionToDisconnect,
    connectSlack,
    connectNangoProvider,
    openDisconnectModal,
    closeDisconnectModal,
    disconnect,
  };
}
