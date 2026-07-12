import { Loader2 as IconLoader2, Plug as IconPlug } from 'lucide-react';

import { IntegrationLogos } from '@/components/IntegrationLogos';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type IntegrationCard = {
  id: string;
  provider: 'slack' | 'granola';
  name: string;
  description: string;
  iconBg: string;
  iconColor: string;
  connected: boolean;
  workspace: string;
  action: () => void | Promise<void>;
};

type IntegrationSettingsProps = {
  integrations: IntegrationCard[];
  loading: boolean;
  connectingProvider: string | null;
  success: string;
  error: string;
};

export function IntegrationSettings({
  integrations,
  loading,
  connectingProvider,
  success,
  error,
}: IntegrationSettingsProps) {
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

      {integrations.map((integration) => (
        <Card key={integration.id} className="mb-[10px] flex items-center gap-[14px] px-4 py-[14px]">
          <div className="w-9 h-9 rounded-[9px] flex items-center justify-center flex-shrink-0" style={{ backgroundColor: integration.iconBg, color: integration.iconColor }}>
            <IntegrationLogos provider={integration.provider} size={22} color={integration.iconColor} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="type-section-title" style={{ color: 'var(--text-primary)' }}>{integration.name}</div>
            <div className="type-body mt-[2px]" style={{ color: 'var(--text-secondary)' }}>{integration.description}</div>
            <div className="flex items-center gap-[5px] mt-1">
              <div className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: integration.connected ? 'var(--green)' : 'var(--border-secondary)' }} />
              <span className="type-caption" style={{ color: integration.connected ? 'var(--green-text)' : 'var(--text-tertiary)' }}>
                {integration.connected ? `Active · ${integration.workspace}` : 'Not Connected'}
              </span>
            </div>
          </div>
          {integration.connected ? (
            <Button variant="destructive" onClick={integration.action}>Disconnect</Button>
          ) : (
            <Button variant="secondary" onClick={integration.action} disabled={connectingProvider !== null}>
              {connectingProvider === integration.provider ? <IconLoader2 size={13} className="animate-spin" /> : <IconPlug size={13} />}
              Connect
            </Button>
          )}
        </Card>
      ))}

      {loading && (
        <div className="flex items-center gap-2 type-body" style={{ color: 'var(--text-tertiary)' }}>
          <IconLoader2 size={14} className="animate-spin" /> Loading Integration Status...
        </div>
      )}
    </div>
  );
}
