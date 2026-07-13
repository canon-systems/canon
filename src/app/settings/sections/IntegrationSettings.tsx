'use client';

import { useState } from 'react';
import { Loader2 as IconLoader2, Plus as IconPlus, Plug as IconPlug, Search as IconSearch } from 'lucide-react';

import { IntegrationLogos } from '@/components/IntegrationLogos';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

type IntegrationCard = {
  id: string;
  provider: string;
  name: string;
  description: string;
  logoUrl: string;
  connected: boolean;
  workspace: string;
  action: () => void | Promise<void>;
};

type IntegrationSettingsProps = {
  integrations: IntegrationCard[];
  availableIntegrations: IntegrationCard[];
  loading: boolean;
  connectingProvider: string | null;
  success: string;
  error: string;
};

export function IntegrationSettings({
  integrations,
  availableIntegrations,
  loading,
  connectingProvider,
  success,
  error,
}: IntegrationSettingsProps) {
  const [addIntegrationOpen, setAddIntegrationOpen] = useState(false);
  const [integrationSearch, setIntegrationSearch] = useState('');
  const normalizedSearch = integrationSearch.trim().toLowerCase();
  const filteredAvailableIntegrations = normalizedSearch
    ? availableIntegrations.filter((integration) =>
        `${integration.name} ${integration.description}`.toLowerCase().includes(normalizedSearch)
      )
    : availableIntegrations;

  function handleAddIntegrationOpenChange(open: boolean) {
    setAddIntegrationOpen(open);
    if (!open) setIntegrationSearch('');
  }

  return (
    <div className="max-w-5xl">
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

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="type-section-title" style={{ color: 'var(--text-primary)' }}>Connected apps</h2>
          <p className="type-body mt-1 max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
            Manage the places Canon can use to keep readiness work current.
          </p>
        </div>
        <Button className="shrink-0" variant="secondary" onClick={() => setAddIntegrationOpen(true)} disabled={loading}>
          <IconPlus size={14} />
          Add Integration
        </Button>
      </div>

      {integrations.length > 0 ? (
        <div className="space-y-2">
          {integrations.map((integration) => (
            <Card key={integration.id} className="flex flex-col gap-3 px-4 py-3 transition-colors duration-150 hover:border-[var(--border-secondary)] hover:bg-[var(--bg-primary)] sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border border-[var(--border-tertiary)] bg-[var(--bg-primary)]">
                  <IntegrationLogos provider={integration.provider} logoUrl={integration.logoUrl} size={30} />
                </div>
                <div className="min-w-0">
                  <div className="type-section-title truncate" style={{ color: 'var(--text-primary)' }}>{integration.name}</div>
                  <div className="mt-[3px] flex items-center gap-[6px]">
                    <div className="h-[7px] w-[7px] rounded-full" style={{ backgroundColor: 'var(--green)' }} />
                    <span className="type-caption" style={{ color: 'var(--green-text)' }}>
                      {integration.workspace}
                    </span>
                  </div>
                </div>
              </div>

              <Button
                className="w-full border-[var(--red-border)] bg-[var(--red-bg)] text-[var(--red-text)] shadow-none hover:bg-[var(--red-bg)] sm:w-auto"
                variant="secondary"
                onClick={integration.action}
              >
                Disconnect
              </Button>
            </Card>
          ))}
        </div>
      ) : !loading ? (
        <Card className="flex min-h-[168px] flex-col items-start justify-center px-5 py-5">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[10px] border border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-tertiary)]">
            <IconPlug size={18} />
          </div>
          <div className="type-section-title" style={{ color: 'var(--text-primary)' }}>No connected apps yet</div>
          <p className="type-body mt-1 max-w-xl" style={{ color: 'var(--text-secondary)' }}>
            Add the first app Canon should use for conversations, meetings, and readiness updates.
          </p>
        </Card>
      ) : null}

      {loading && (
        <div className="mt-4 flex items-center gap-2 type-body" style={{ color: 'var(--text-tertiary)' }}>
          <IconLoader2 size={14} className="animate-spin" /> Loading Integration Status...
        </div>
      )}

      <Dialog open={addIntegrationOpen} onOpenChange={handleAddIntegrationOpenChange}>
        <DialogContent className="max-w-lg border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle>Add Integration</DialogTitle>
            <DialogDescription>
              Connect another app Canon can use for readiness work.
            </DialogDescription>
          </DialogHeader>

          {availableIntegrations.length > 0 ? (
            <div className="space-y-2">
              <div className="relative">
                <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
                <Input
                  value={integrationSearch}
                  onChange={(event) => setIntegrationSearch(event.target.value)}
                  placeholder="Search integrations..."
                  className="h-9 pl-8"
                />
              </div>

              {filteredAvailableIntegrations.length > 0 ? (
                filteredAvailableIntegrations.map((integration) => (
                  <div
                    key={integration.id}
                    className="flex items-center gap-3 rounded-[10px] border px-3 py-3"
                    style={{ borderColor: 'var(--border-tertiary)', backgroundColor: 'var(--bg-primary)' }}
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border border-[var(--border-tertiary)] bg-[var(--bg-primary)]">
                      <IntegrationLogos provider={integration.provider} logoUrl={integration.logoUrl} size={30} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="type-panel-title" style={{ color: 'var(--text-primary)' }}>{integration.name}</div>
                      <div className="type-caption mt-[2px] leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>{integration.description}</div>
                    </div>
                    <Button
                      className="shrink-0"
                      variant="secondary"
                      onClick={integration.action}
                      disabled={connectingProvider !== null}
                    >
                      {connectingProvider === integration.provider ? <IconLoader2 size={13} className="animate-spin" /> : <IconPlug size={13} />}
                      Connect
                    </Button>
                  </div>
                ))
              ) : (
                <div className="rounded-[10px] border px-4 py-4" style={{ borderColor: 'var(--border-tertiary)', backgroundColor: 'var(--bg-secondary)' }}>
                  <div className="type-panel-title" style={{ color: 'var(--text-primary)' }}>No matching integrations</div>
                  <p className="type-body mt-1" style={{ color: 'var(--text-secondary)' }}>
                    Try a different app name.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-[10px] border px-4 py-4" style={{ borderColor: 'var(--border-tertiary)', backgroundColor: 'var(--bg-secondary)' }}>
              <div className="type-panel-title" style={{ color: 'var(--text-primary)' }}>All available apps are connected</div>
              <p className="type-body mt-1" style={{ color: 'var(--text-secondary)' }}>
                New integrations will appear here when they are ready to connect.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
