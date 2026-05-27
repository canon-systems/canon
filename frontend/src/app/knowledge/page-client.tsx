'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  IconAlertCircle,
  IconChecks,
  IconClock,
  IconDatabase,
  IconDotsVertical,
  IconEdit,
  IconHash,
  IconPlayerStop,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconTrash,
} from '@tabler/icons-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IntegrationLogos } from '@/components/IntegrationLogos';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { StatusBadge } from '@/components/ui/status-badge';
import type { KnowledgeProvider, KnowledgeSource, SourceOption } from '@/types/onboarding';

type IntegrationConnection = {
  provider?: string;
  status?: string;
};

function statusVariant(status: string) {
  if (status === 'active') return 'active';
  if (status === 'error') return 'error';
  if (status === 'stopped') return 'stalled';
  if (status === 'syncing') return 'pending';
  return 'pending';
}

function fmtDate(d: string | null) {
  if (!d) return 'Never';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function sourceIconStyle(status: string) {
  if (status === 'active') return { backgroundColor: 'var(--green-bg)', color: 'var(--green-text)' };
  if (status === 'error') return { backgroundColor: 'var(--red-bg)', color: 'var(--red-text)' };
  return { backgroundColor: 'var(--bg-secondary)', color: 'var(--text-tertiary)' };
}

function sourceOptionKey(sourceOption: SourceOption) {
  const provider = sourceOption.provider ?? 'slack';
  if (provider === 'gong') return 'gong:calls';
  return sourceOption.id;
}

function sourceKey(source: KnowledgeSource) {
  if (source.provider === 'gong') return 'gong:calls';
  return source.slack_channel_id;
}

function sourceDisplayName(source: KnowledgeSource | SourceOption) {
  const provider = ('provider' in source ? source.provider : undefined) ?? 'slack';
  if (provider === 'slack') return `#${source.name}`;
  return source.name;
}

function sourceProviderLabel(provider: KnowledgeProvider) {
  if (provider === 'gong') return 'Gong';
  if (provider === 'slack') return 'Slack';
  return 'Source';
}

function sourceStatusNotice(status: string) {
  if (status === 'error') {
    return {
      title: 'Sync Needs Attention',
      body: 'Canon could not finish syncing this source. Try syncing again, or reconnect the source if the issue continues.',
      tone: 'error' as const,
    };
  }
  if (status === 'stopped') {
    return {
      title: 'Sync Stopped',
      body: 'Syncing was stopped before this source finished updating. Start a new sync when you are ready.',
      tone: 'neutral' as const,
    };
  }
  return null;
}

function sourceLoadMessage(data: { error?: string; detail?: string; needed?: string }) {
  if (data.detail === 'missing_scope' || data.needed) {
    return 'This source needs additional permissions before Canon can load items. Reconnect it from Settings and try again.';
  }
  if (data.error === 'No active Slack connection') {
    return 'Connect a source from Settings before adding it to knowledge.';
  }
  return 'Could not load sources. Try again in a moment.';
}

function actionFailureMessage(action: 'sync' | 'stop' | 'rename' | 'delete' | 'add') {
  if (action === 'sync') return 'Could not start sync. Try again in a moment.';
  if (action === 'stop') return 'Could not stop sync. Try again in a moment.';
  if (action === 'rename') return 'Could not rename this source. Try again in a moment.';
  if (action === 'delete') return 'Could not delete the selected source. Try again in a moment.';
  return 'Could not add the selected sources. Try again in a moment.';
}

function isSyncInProgress(status: string) {
  return status === 'pending' || status === 'syncing';
}

export function KnowledgeClient() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [sourceOptions, setSourceOptions] = useState<SourceOption[]>([]);
  const [sourceOptionsLoading, setSourceOptionsLoading] = useState(false);
  const [sourceOptionsError, setSourceOptionsError] = useState('');
  const [selectedSourceOptionIds, setSelectedSourceOptionIds] = useState<Set<string>>(new Set());
  const [sourceSearch, setSourceSearch] = useState('');
  const [noIntegrationsConnected, setNoIntegrationsConnected] = useState(false);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<KnowledgeSource | null>(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());
  const [renameSource, setRenameSource] = useState<KnowledgeSource | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteRequest, setDeleteRequest] = useState<{ ids: string[]; title: string; description: string } | null>(null);
  const [actionError, setActionError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  function canStopSync(status: string) {
    return isSyncInProgress(status);
  }

  const loadSources = useCallback(async () => {
    try {
      const res = await fetch('/api/onboarding/knowledge');
      const data = (await res.json()) as { sources?: KnowledgeSource[] };
      const nextSources = data.sources ?? [];
      setSources(nextSources);
      setSelected((current) => {
        if (!current) return nextSources[0] ?? null;
        return nextSources.find((source) => source.id === current.id) ?? nextSources[0] ?? null;
      });
      setSelectedSourceIds((current) => {
        const nextIds = new Set(nextSources.map((source) => source.id));
        return new Set([...current].filter((id) => nextIds.has(id)));
      });
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadSources(); }, [loadSources]);

  useEffect(() => {
    if (!sources.some((source) => isSyncInProgress(source.status))) return;

    const interval = window.setInterval(() => {
      void loadSources();
    }, 3000);

    return () => window.clearInterval(interval);
  }, [loadSources, sources]);

  async function triggerSync(sourceId: string) {
    setSyncing(sourceId);
    try {
      const res = await fetch(`/api/onboarding/knowledge/${sourceId}/sync`, { method: 'POST' });
      if (!res.ok) throw new Error(actionFailureMessage('sync'));
      await loadSources();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : actionFailureMessage('sync'));
    } finally {
      setSyncing(null);
    }
  }

  async function syncSources(sourceIds: string[]) {
    if (sourceIds.length === 0) return;
    setActionLoading(true);
    try {
      for (const sourceId of sourceIds) {
        const res = await fetch(`/api/onboarding/knowledge/${sourceId}/sync`, { method: 'POST' });
        if (!res.ok) throw new Error(actionFailureMessage('sync'));
      }
      await loadSources();
      toast.success(sourceIds.length === 1 ? 'Sync started' : `${sourceIds.length} syncs started`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : actionFailureMessage('sync'));
    } finally {
      setActionLoading(false);
    }
  }

  async function stopSyncSources(sourceIds: string[]) {
    if (sourceIds.length === 0) return;
    setActionLoading(true);
    try {
      for (const sourceId of sourceIds) {
        const res = await fetch(`/api/onboarding/knowledge/${sourceId}/sync`, { method: 'DELETE' });
        if (!res.ok) throw new Error(actionFailureMessage('stop'));
      }
      await loadSources();
      toast.success(sourceIds.length === 1 ? 'Sync stopped' : `${sourceIds.length} syncs stopped`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : actionFailureMessage('stop'));
    } finally {
      setActionLoading(false);
    }
  }

  async function loadSourceOptions() {
    setSourceOptionsLoading(true);
    setSourceOptionsError('');
    setNoIntegrationsConnected(false);
    try {
      const [slackResult, integrationsResult] = await Promise.allSettled([
        fetch('/api/onboarding/slack/channels'),
        fetch('/api/integrations/list', { credentials: 'include' }),
      ]);

      let slackError = '';
      let slackNotConnected = false;
      let options: SourceOption[] = [];

      if (slackResult.status === 'fulfilled') {
        const data = (await slackResult.value.json()) as {
          channels?: SourceOption[];
          error?: string;
          detail?: string;
          needed?: string;
          provided?: string;
        };
        if (slackResult.value.ok) {
          options = (data.channels ?? []).map((channel) => ({ ...channel, provider: 'slack' }));
        } else {
          slackError = sourceLoadMessage(data);
          if (data.error === 'No active Slack connection') slackNotConnected = true;
        }
      } else {
        slackError = sourceLoadMessage({});
      }

      let gongNotConnected = true;
      if (integrationsResult.status === 'fulfilled' && integrationsResult.value.ok) {
        const data = (await integrationsResult.value.json()) as { connections?: IntegrationConnection[] };
        const hasGongConnection = (data.connections ?? []).some((connection) => connection.provider === 'gong' && connection.status === 'active');
        if (hasGongConnection) {
          gongNotConnected = false;
          options.push({
            id: 'gong:calls',
            name: 'Gong Calls',
            provider: 'gong',
            member_count: 0,
            topic: 'Call transcripts from Gong',
          });
        }
      }

      if (slackNotConnected && gongNotConnected) {
        setNoIntegrationsConnected(true);
        setSourceOptions([]);
        setSelectedSourceOptionIds(new Set());
        return;
      }

      if (options.length === 0 && slackError) {
        throw new Error(slackError);
      }
      setSourceOptions(options);
      setSelectedSourceOptionIds((current) => {
        const availableIds = new Set(options.map(sourceOptionKey));
        return new Set([...current].filter((id) => availableIds.has(id)));
      });
    } catch (error: unknown) {
      setSourceOptions([]);
      setSelectedSourceOptionIds(new Set());
      setSourceOptionsError(error instanceof Error ? error.message : sourceLoadMessage({}));
    } finally {
      setSourceOptionsLoading(false);
    }
  }

  function openAddModal() {
    setShowAddModal(true);
    setSelectedSourceOptionIds(new Set());
    setSourceSearch('');
    void loadSourceOptions();
  }

  function handleAddModalOpenChange(open: boolean) {
    setShowAddModal(open);
    if (!open) {
      setSelectedSourceOptionIds(new Set());
      setSourceSearch('');
      setSourceOptionsError('');
      setNoIntegrationsConnected(false);
    }
  }

  function toggleSourceOptionSelection(sourceOptionId: string) {
    setSelectedSourceOptionIds((current) => {
      const next = new Set(current);
      if (next.has(sourceOptionId)) {
        next.delete(sourceOptionId);
      } else {
        next.add(sourceOptionId);
      }
      return next;
    });
  }

  function toggleSourceSelection(sourceId: string) {
    setSelectedSourceIds((current) => {
      const next = new Set(current);
      if (next.has(sourceId)) {
        next.delete(sourceId);
      } else {
        next.add(sourceId);
      }
      return next;
    });
  }

  function selectAllSources() {
    setSelectedSourceIds(new Set(sources.map((source) => source.id)));
  }

  function toggleAllSources() {
    if (selectedSourceIds.size === sources.length) {
      clearSourceSelection();
      return;
    }

    selectAllSources();
  }

  function clearSourceSelection() {
    setSelectedSourceIds(new Set());
  }

  function openRenameDialog(source: KnowledgeSource) {
    setRenameSource(source);
    setRenameValue(source.name);
    setActionError('');
  }

  function openDeleteDialog(sourceIds: string[]) {
    const targetSources = sources.filter((source) => sourceIds.includes(source.id));
    if (targetSources.length === 0) return;

    setDeleteRequest({
      ids: targetSources.map((source) => source.id),
      title: targetSources.length === 1 ? `Delete ${targetSources[0].name}?` : `Delete ${targetSources.length} sources?`,
      description: targetSources.length === 1
        ? 'This removes the source from Canon knowledge and deletes its indexed history.'
        : 'This removes the selected sources from Canon knowledge and deletes their indexed history.',
    });
    setActionError('');
  }

  async function saveRename() {
    if (!renameSource) return;
    const nextName = renameValue.trim();
    if (!nextName) {
      setActionError('Name is required.');
      return;
    }

    setActionLoading(true);
    setActionError('');
    try {
      const res = await fetch(`/api/onboarding/knowledge/${renameSource.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nextName }),
      });

      if (!res.ok) throw new Error(actionFailureMessage('rename'));

      setRenameSource(null);
      setRenameValue('');
      await loadSources();
      toast.success('Source renamed');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : actionFailureMessage('rename'));
    } finally {
      setActionLoading(false);
    }
  }

  async function confirmDelete() {
    if (!deleteRequest) return;

    const count = deleteRequest.ids.length;
    setActionLoading(true);
    try {
      for (const sourceId of deleteRequest.ids) {
        const res = await fetch(`/api/onboarding/knowledge/${sourceId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(actionFailureMessage('delete'));
      }

      setSelectedSourceIds((current) => {
        const deleted = new Set(deleteRequest.ids);
        return new Set([...current].filter((id) => !deleted.has(id)));
      });
      setDeleteRequest(null);
      await loadSources();
      toast.success(count === 1 ? 'Source removed' : `${count} sources removed`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : actionFailureMessage('delete'));
    } finally {
      setActionLoading(false);
    }
  }

  async function addSelectedSources() {
    const selectedSourceOptions = sourceOptions.filter(
      (sourceOption) => selectedSourceOptionIds.has(sourceOptionKey(sourceOption)) && !connectedSourceOptionIds.has(sourceOptionKey(sourceOption))
    );
    if (selectedSourceOptions.length === 0) return;

    setAdding(true);
    setSourceOptionsError('');
    try {
      for (const sourceOption of selectedSourceOptions) {
        const provider = sourceOption.provider ?? 'slack';
        const res = await fetch('/api/onboarding/knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(provider === 'gong'
            ? {
              provider,
              name: sourceOption.name,
            }
            : {
              provider,
              slack_channel_id: sourceOption.id,
              slack_channel_name: sourceOption.name,
              name: `#${sourceOption.name}`,
            }),
        });

        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          if (data.error === 'Organization not found') {
            throw new Error('org_not_found');
          }
          throw new Error(actionFailureMessage('add'));
        }
      }

      setShowAddModal(false);
      setSelectedSourceOptionIds(new Set());
      setSourceSearch('');
      await loadSources();
      toast.success(selectedSourceOptions.length === 1 ? 'Source added' : `${selectedSourceOptions.length} sources added`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'org_not_found') {
        toast.error('Organization not found', { description: 'Your account setup isn\'t complete. Visit Settings to finish setting up your organization.' });
      } else {
        setSourceOptionsError(msg || actionFailureMessage('add'));
      }
    } finally {
      setAdding(false);
    }
  }

  const filteredSourceOptions = sourceOptions.filter(
    (c) => `${c.name} ${c.topic ?? ''}`.toLowerCase().includes(sourceSearch.toLowerCase())
  );
  const connectedSourceOptionIds = new Set(sources.map(sourceKey).filter(Boolean));
  const selectedSourceCount = selectedSourceIds.size;
  const selectedStoppableSourceIds = sources
    .filter((source) => selectedSourceIds.has(source.id) && canStopSync(source.status))
    .map((source) => source.id);
  const allSourcesSelected = sources.length > 0 && selectedSourceCount === sources.length;
  const hasSourceSelection = selectedSourceCount > 0;
  const selectableCount = filteredSourceOptions.filter((sourceOption) => !connectedSourceOptionIds.has(sourceOptionKey(sourceOption))).length;
  const selectedCount = [...selectedSourceOptionIds].filter((id) => !connectedSourceOptionIds.has(id)).length;
  const addButtonLabel = selectedCount === 0
    ? 'Add Sources'
    : `Add ${selectedCount} Source${selectedCount === 1 ? '' : 's'}`;
  const totalKnowledgeItems = sources.reduce((sum, source) => sum + (source.chunk_count ?? 0), 0);
  const activeCount = sources.filter((source) => source.status === 'active').length;
  const errorCount = sources.filter((source) => source.status === 'error').length;
  const pendingCount = sources.filter((source) => isSyncInProgress(source.status)).length;

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--border-tertiary)' }}>
          <Skeleton className="h-8 w-48 bg-[var(--bg-primary)]" />
        </div>
        <div className="flex gap-3 px-6 py-[14px] border-b" style={{ borderColor: 'var(--border-tertiary)' }}>
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 flex-1 rounded-[8px] bg-[var(--bg-primary)]" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b" style={{ borderColor: 'var(--border-tertiary)' }}>
        <div>
          <h1 className="type-page-title" style={{ color: 'var(--text-primary)' }}>Knowledge</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={openAddModal} size="sm"><IconPlus size={14} /> Add Source</Button>
        </div>
      </div>

      <div className="flex gap-3 px-6 py-[14px] border-b" style={{ borderColor: 'var(--border-tertiary)' }}>
        {[
          { icon: IconDatabase, iconColor: 'var(--canon-purple)', iconBg: 'var(--canon-purple-light)', value: totalKnowledgeItems, label: 'Knowledge Items' },
          { icon: IconChecks, iconColor: 'var(--green)', iconBg: 'var(--green-bg)', value: activeCount, label: 'Active Sources' },
          { icon: IconAlertCircle, iconColor: 'var(--red)', iconBg: 'var(--red-bg)', value: errorCount, label: 'Needs Attention' },
          { icon: IconClock, iconColor: 'var(--amber)', iconBg: 'var(--amber-bg)', value: pendingCount, label: 'Pending Sync' },
        ].map(({ icon: Icon, iconColor, iconBg, value, label }) => (
          <div key={label} className="rounded-[8px] px-4 py-[10px] flex items-center gap-[10px] flex-1" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <div className="w-8 h-8 rounded-[7px] flex items-center justify-center" style={{ backgroundColor: iconBg, color: iconColor }}>
              <Icon size={16} />
            </div>
            <div>
              <div className="type-metric-sm" style={{ color: 'var(--text-primary)' }}>{value}</div>
              <div className="type-caption mt-[1px]" style={{ color: 'var(--text-tertiary)' }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {sources.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 py-12">
          <IconDatabase size={32} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
          <div className="type-section-title" style={{ color: 'var(--text-secondary)' }}>No Knowledge Sources Yet</div>
          <div className="type-body text-center max-w-[240px] leading-[1.5]" style={{ color: 'var(--text-tertiary)' }}>
            Connect sources so Canon can learn from their history.
          </div>
          <Button onClick={openAddModal} size="sm"><IconPlus size={13} /> Add a Source</Button>
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-3">
          <div className="min-w-0 overflow-y-auto border-r lg:col-span-1" style={{ borderColor: 'var(--border-tertiary)' }}>
            <div className="sticky top-0 z-10 border-b px-[14px] py-[10px]" style={{ backgroundColor: 'var(--bg-page)', borderColor: 'var(--border-tertiary)' }}>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allSourcesSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = hasSourceSelection && !allSourcesSelected;
                  }}
                  onChange={toggleAllSources}
                  className="h-4 w-4 flex-shrink-0 accent-[var(--canon-purple)]"
                  aria-label={allSourcesSelected ? 'Clear source selection' : 'Select all sources'}
                  aria-checked={hasSourceSelection && !allSourcesSelected ? 'mixed' : allSourcesSelected}
                />
                {hasSourceSelection ? (
                  <>
                    <div className="min-w-0 flex-1 type-caption font-medium" style={{ color: 'var(--text-secondary)' }}>
                      {selectedSourceCount} selected
                    </div>
                    <TooltipProvider delayDuration={120}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => syncSources([...selectedSourceIds])}
                            disabled={actionLoading}
                            aria-label="Sync selected sources"
                          >
                            <IconRefresh size={14} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Sync selected sources</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider delayDuration={120}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => stopSyncSources(selectedStoppableSourceIds)}
                            disabled={selectedStoppableSourceIds.length === 0 || actionLoading}
                            aria-label="Stop sync for selected sources"
                          >
                            <IconPlayerStop size={14} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Stop sync for selected sources</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider delayDuration={120}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openDeleteDialog([...selectedSourceIds])}
                            disabled={actionLoading}
                            className="text-[var(--red-text)] hover:text-[var(--red-text)] hover:bg-[var(--red-bg)]"
                            aria-label="Delete selected sources"
                          >
                            <IconTrash size={14} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Delete selected sources</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={clearSourceSelection}
                      disabled={actionLoading}
                      className="px-2"
                    >
                      Clear
                    </Button>
                  </>
                ) : (
                  <div className="min-w-0 flex-1 type-caption font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Sources
                  </div>
                )}
              </div>
            </div>
            {sources.map((source) => (
              <div
                key={source.id}
                className="w-full flex items-center gap-[10px] py-[11px] border-b text-left transition-colors duration-[120ms]"
                style={{
                  padding: '11px 14px',
                  borderColor: 'var(--border-tertiary)',
                  backgroundColor: selected?.id === source.id ? 'var(--canon-purple-selected)' : 'transparent',
                  borderLeft: selected?.id === source.id ? '3px solid var(--canon-purple)' : undefined,
                }}
                onMouseEnter={(e) => { if (selected?.id !== source.id) e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'; }}
                onMouseLeave={(e) => { if (selected?.id !== source.id) e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <input
                  type="checkbox"
                  checked={selectedSourceIds.has(source.id)}
                  onChange={() => toggleSourceSelection(source.id)}
                  className="h-4 w-4 flex-shrink-0 accent-[var(--canon-purple)]"
                  aria-label={`Select ${source.name}`}
                />
                <div className="w-8 h-8 rounded-[7px] flex items-center justify-center flex-shrink-0" style={sourceIconStyle(source.status)}>
                  {source.provider === 'gong' ? <IconDatabase size={15} /> : <IconHash size={15} />}
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(source)}
                  className="min-w-0 flex-1 cursor-pointer text-left"
                >
                  <div className="type-panel-title truncate" style={{ color: 'var(--text-primary)' }}>{source.name}</div>
                  <div className="type-caption mt-[1px]" style={{ color: 'var(--text-tertiary)' }}>{source.chunk_count} item{source.chunk_count === 1 ? '' : 's'} indexed</div>
                </button>
                <StatusBadge variant={statusVariant(source.status)} label={source.status} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Open actions for ${source.name}`}
                      disabled={actionLoading}
                      className="w-7 h-7 rounded-md border border-[var(--border-tertiary)] bg-transparent flex items-center justify-center cursor-pointer text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] transition-colors duration-[120ms] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <IconDotsVertical size={15} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openRenameDialog(source)}>
                      <IconEdit size={14} />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => syncSources([source.id])} disabled={actionLoading || isSyncInProgress(source.status)}>
                      <IconRefresh size={14} />
                      Sync Now
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => stopSyncSources([source.id])} disabled={actionLoading || !canStopSync(source.status)}>
                      <IconPlayerStop size={14} />
                      Stop Sync
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-[var(--red-text)] focus:text-[var(--red-text)]" onClick={() => openDeleteDialog([source.id])}>
                      <IconTrash size={14} />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>

          <div className="min-w-0 overflow-y-auto px-6 py-5 lg:col-span-2">
            {selected ? (
              <div className="w-full">
                {(() => {
                  const notice = sourceStatusNotice(selected.status);
                  if (!notice) return null;

                  return (
                    <div
                      className="flex items-start gap-[10px] rounded-[8px] px-[14px] py-3 mb-5 border"
                      style={{
                        backgroundColor: notice.tone === 'error' ? 'var(--red-bg)' : 'var(--bg-secondary)',
                        borderColor: notice.tone === 'error' ? 'var(--red-border)' : 'var(--border-tertiary)',
                      }}
                    >
                      <IconAlertCircle
                        size={16}
                        style={{
                          color: notice.tone === 'error' ? 'var(--red)' : 'var(--text-tertiary)',
                          marginTop: 1,
                          flexShrink: 0,
                        }}
                      />
                      <div>
                        <div
                          className="type-panel-title mb-[2px]"
                          style={{ color: notice.tone === 'error' ? 'var(--red-text)' : 'var(--text-primary)' }}
                        >
                          {notice.title}
                        </div>
                        <div className="type-body" style={{ color: 'var(--text-secondary)' }}>{notice.body}</div>
                      </div>
                    </div>
                  );
                })()}

                <div className="flex items-center justify-between gap-4 mb-5">
                  <div className="flex items-center gap-3">
                    <h2 className="type-metric-sm" style={{ color: 'var(--text-primary)' }}>{selected.name}</h2>
                    <StatusBadge variant={statusVariant(selected.status)} label={selected.status} />
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => triggerSync(selected.id)}
                    disabled={syncing === selected.id || isSyncInProgress(selected.status)}
                  >
                    <IconRefresh size={13} className={(syncing === selected.id || isSyncInProgress(selected.status)) ? 'animate-spin' : ''} />
                    {(syncing === selected.id || isSyncInProgress(selected.status)) ? 'Syncing...' : 'Sync Now'}
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-5">
                  {[
                    { label: 'Items Indexed', value: selected.chunk_count ?? 0 },
                    { label: 'Last Synced', value: fmtDate(selected.last_synced_at) },
                    { label: 'Type', value: sourceProviderLabel(selected.provider) },
                  ].map((item) => (
                    <div key={item.label} className="rounded-[8px] p-[12px]" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                      <div className="type-caption mb-1" style={{ color: 'var(--text-tertiary)' }}>{item.label}</div>
                      <div className="type-metric-sm capitalize" style={{ color: 'var(--text-primary)' }}>{item.value}</div>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="type-panel-title mb-2" style={{ color: 'var(--text-primary)' }}>Sync History</div>
                  {[
                    {
                      success: selected.status !== 'error',
                      label: selected.status === 'error'
                        ? 'Sync Needs Attention'
                        : selected.status === 'stopped'
                          ? 'Sync Stopped'
                          : 'Latest Sync Complete',
                      time: fmtDate(selected.last_synced_at),
                      chunks: `${selected.chunk_count ?? 0} item${selected.chunk_count === 1 ? '' : 's'} indexed`,
                    },
                    { success: true, label: 'Source Connected', time: fmtDate(selected.created_at), chunks: 'Ready' },
                  ].map((event) => (
                    <div key={`${event.label}-${event.time}`} className="flex items-center gap-[10px] py-[10px] border-b" style={{ borderColor: 'var(--border-tertiary)' }}>
                      <div className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ backgroundColor: event.success ? 'var(--green)' : 'var(--red)' }} />
                      <div className="flex-1">
                        <div className="type-panel-title" style={{ color: 'var(--text-primary)' }}>{event.label}</div>
                        <div className="type-caption mt-[1px]" style={{ color: 'var(--text-tertiary)' }}>{event.time}</div>
                      </div>
                      <div className="type-body font-medium" style={{ color: 'var(--text-secondary)' }}>{event.chunks}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <IconDatabase size={32} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
                <div className="type-section-title" style={{ color: 'var(--text-secondary)' }}>Select a Source</div>
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={showAddModal} onOpenChange={handleAddModalOpenChange}>
        <DialogContent className="max-w-md border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--text-primary)]">Add Source</DialogTitle>
            <DialogDescription>
              {noIntegrationsConnected ? 'Connect an integration to start adding knowledge sources.' : 'Select sources for Canon to learn from.'}
            </DialogDescription>
          </DialogHeader>
          {!noIntegrationsConnected && (
            <div className="relative">
              <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
              <Input
                value={sourceSearch}
                onChange={(e) => setSourceSearch(e.target.value)}
                placeholder="Search Sources..."
                className="input-ui pl-9 border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] type-body"
              />
            </div>
          )}
          <div className="max-h-64 overflow-y-auto space-y-1">
            {sourceOptionsLoading ? (
              <div className="space-y-1.5 py-1">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 bg-[var(--bg-secondary)] rounded-lg" />)}
              </div>
            ) : noIntegrationsConnected ? (
              <div className="py-2 space-y-2">
                <p className="type-body pb-1" style={{ color: 'var(--text-secondary)' }}>
                  No integrations are connected yet. Go to Settings to connect a source.
                </p>
                {[
                  { provider: 'slack' as const, label: 'Slack', description: 'Sync channel messages and threads' },
                  { provider: 'gong' as const, label: 'Gong', description: 'Sync customer call transcripts' },
                ].map(({ provider, label, description }) => (
                  <a
                    key={provider}
                    href="/settings?tab=integrations"
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors hover:bg-[var(--bg-secondary)]"
                    style={{ borderColor: 'var(--border-secondary)', textDecoration: 'none' }}
                  >
                    <div className="size-8 rounded-[8px] flex flex-shrink-0 items-center justify-center" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                      <IntegrationLogos provider={provider} size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="type-panel-title" style={{ color: 'var(--text-primary)' }}>{label}</p>
                      <p className="type-caption" style={{ color: 'var(--text-tertiary)' }}>{description}</p>
                    </div>
                    <span className="type-caption flex-shrink-0" style={{ color: 'var(--canon-purple)' }}>Connect →</span>
                  </a>
                ))}
              </div>
            ) : sourceOptionsError ? (
              <div className="rounded-[8px] border border-[var(--red-border)] bg-[var(--red-bg)] px-3 py-2">
                <p className="type-body" style={{ color: 'var(--red-text)' }}>{sourceOptionsError}</p>
              </div>
            ) : filteredSourceOptions.length === 0 ? (
              <p className="type-body py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>No Sources Found</p>
            ) : (
              filteredSourceOptions.map((sourceOption) => {
                const optionKey = sourceOptionKey(sourceOption);
                const connected = connectedSourceOptionIds.has(optionKey);
                const checked = selectedSourceOptionIds.has(optionKey);
                const provider = sourceOption.provider ?? 'slack';
                return (
                  <label
                    key={optionKey}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors text-left cursor-pointer has-[:disabled]:opacity-50 has-[:disabled]:cursor-not-allowed"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={connected || adding}
                        onChange={() => toggleSourceOptionSelection(optionKey)}
                        className="h-4 w-4 flex-shrink-0 accent-[var(--canon-purple)]"
                        aria-label={`Select ${sourceDisplayName(sourceOption)}`}
                      />
                      <div className="size-7 rounded-[7px] flex flex-shrink-0 items-center justify-center" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}>
                        {provider === 'gong' ? <IconDatabase size={14} /> : <IconHash size={14} />}
                      </div>
                      <div className="min-w-0">
                        <span className="type-panel-title truncate" style={{ color: 'var(--text-primary)' }}>{sourceDisplayName(sourceOption)}</span>
                        {sourceOption.member_count > 0 && (
                          <span className="type-caption ml-2" style={{ color: 'var(--text-tertiary)' }}>{sourceOption.member_count} members</span>
                        )}
                        {provider === 'gong' && (
                          <span className="type-caption ml-2" style={{ color: 'var(--text-tertiary)' }}>Call transcripts</span>
                        )}
                      </div>
                    </div>
                    {connected && <StatusBadge variant="delivered" label="Connected" />}
                  </label>
                );
              })
            )}
          </div>
          {!sourceOptionsLoading && !sourceOptionsError && !noIntegrationsConnected && filteredSourceOptions.length > 0 && (
            <div className="flex items-center justify-between gap-3 border-t pt-3" style={{ borderColor: 'var(--border-tertiary)' }}>
              <p className="type-caption" style={{ color: 'var(--text-tertiary)' }}>
                {selectedCount} selected{selectableCount > 0 ? ` of ${selectableCount}` : ''}
              </p>
              <Button size="sm" onClick={addSelectedSources} disabled={selectedCount === 0 || adding}>
                {adding ? 'Adding...' : addButtonLabel}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!renameSource}
        onOpenChange={(open) => {
          if (!open) {
            setRenameSource(null);
            setRenameValue('');
            setActionError('');
          }
        }}
      >
        <DialogContent className="max-w-md border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle>Rename Source</DialogTitle>
            <DialogDescription>
              Update the display name for this knowledge source.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            className="input-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] type-body"
            placeholder="Source name"
          />
          {actionError && (
            <div className="rounded-[8px] border px-3 py-2 type-body" style={{ backgroundColor: 'var(--red-bg)', borderColor: 'var(--red-border)', color: 'var(--red-text)' }}>
              {actionError}
            </div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRenameSource(null)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button onClick={saveRename} disabled={actionLoading || !renameValue.trim()}>
              {actionLoading ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteRequest}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteRequest(null);
            setActionError('');
          }
        }}
      >
        <DialogContent className="max-w-md border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle>{deleteRequest?.title ?? 'Delete sources?'}</DialogTitle>
            <DialogDescription>
              {deleteRequest?.description ?? 'This removes the selected sources from Canon knowledge.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteRequest(null)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={actionLoading}>
              {actionLoading ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
