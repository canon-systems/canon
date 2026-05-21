'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  IconAlertCircle,
  IconArrowRight,
  IconChecks,
  IconClock,
  IconDatabase,
  IconHash,
  IconPlus,
  IconRefresh,
  IconSearch,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import type { KnowledgeSource, SlackChannel } from '@/types/onboarding';

function statusVariant(status: string) {
  if (status === 'active') return 'active';
  if (status === 'error') return 'error';
  if (status === 'syncing') return 'pending';
  return 'pending';
}

function fmtDate(d: string | null) {
  if (!d) return 'Never';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function channelIconStyle(status: string) {
  if (status === 'active') return { backgroundColor: 'var(--green-bg)', color: 'var(--green-text)' };
  if (status === 'error') return { backgroundColor: 'var(--red-bg)', color: 'var(--red-text)' };
  return { backgroundColor: 'var(--bg-secondary)', color: 'var(--text-tertiary)' };
}

export function KnowledgeClient() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelSearch, setChannelSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<KnowledgeSource | null>(null);

  const loadSources = useCallback(async () => {
    try {
      const res = await fetch('/api/onboarding/knowledge');
      const data = (await res.json()) as { sources?: KnowledgeSource[] };
      const nextSources = data.sources ?? [];
      setSources(nextSources);
      setSelected((current) => current ?? nextSources[0] ?? null);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadSources(); }, [loadSources]);

  async function triggerSync(sourceId: string) {
    setSyncing(sourceId);
    try {
      await fetch(`/api/onboarding/knowledge/${sourceId}/sync`, { method: 'POST' });
      await loadSources();
    } finally {
      setSyncing(null);
    }
  }

  async function loadChannels() {
    setChannelsLoading(true);
    try {
      const res = await fetch('/api/onboarding/slack/channels');
      const data = (await res.json()) as { channels?: SlackChannel[] };
      setChannels(data.channels ?? []);
    } catch {
      setChannels([]);
    } finally {
      setChannelsLoading(false);
    }
  }

  function openAddModal() {
    setShowAddModal(true);
    void loadChannels();
  }

  async function addChannel(channel: SlackChannel) {
    setAdding(true);
    try {
      await fetch('/api/onboarding/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slack_channel_id: channel.id,
          slack_channel_name: channel.name,
          name: `#${channel.name}`,
        }),
      });
      setShowAddModal(false);
      await loadSources();
    } finally {
      setAdding(false);
    }
  }

  const filteredChannels = channels.filter(
    (c) => c.name.toLowerCase().includes(channelSearch.toLowerCase())
  );
  const connectedIds = new Set(sources.map((s) => s.slack_channel_id).filter(Boolean));
  const totalChunks = sources.reduce((sum, source) => sum + (source.chunk_count ?? 0), 0);
  const activeCount = sources.filter((source) => source.status === 'active').length;
  const errorCount = sources.filter((source) => source.status === 'error').length;
  const pendingCount = sources.filter((source) => source.status === 'pending' || source.status === 'syncing').length;

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
          <p className="type-page-subtitle mt-[2px]" style={{ color: 'var(--text-tertiary)' }}>Slack Channels Canon Learns From</p>
        </div>
        <Button onClick={openAddModal} size="sm"><IconPlus size={14} /> Add Channel</Button>
      </div>

      <div className="flex gap-3 px-6 py-[14px] border-b" style={{ borderColor: 'var(--border-tertiary)' }}>
        {[
          { icon: IconDatabase, iconColor: 'var(--canon-purple)', iconBg: 'var(--canon-purple-light)', value: totalChunks, label: 'Total Chunks' },
          { icon: IconChecks, iconColor: 'var(--green)', iconBg: 'var(--green-bg)', value: activeCount, label: 'Active Channels' },
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
            Connect Slack channels so Canon can learn from their history.
          </div>
          <Button onClick={openAddModal} size="sm"><IconPlus size={13} /> Add a Channel</Button>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <div className="w-[300px] flex-shrink-0 overflow-y-auto border-r" style={{ borderColor: 'var(--border-tertiary)' }}>
            {sources.map((source) => (
              <button
                key={source.id}
                type="button"
                onClick={() => setSelected(source)}
                className="w-full flex items-center gap-[10px] py-[11px] border-b cursor-pointer text-left transition-colors duration-[120ms]"
                style={{
                  padding: '11px 14px',
                  borderColor: 'var(--border-tertiary)',
                  backgroundColor: selected?.id === source.id ? 'var(--canon-purple-selected)' : 'transparent',
                  borderLeft: selected?.id === source.id ? '3px solid var(--canon-purple)' : undefined,
                }}
                onMouseEnter={(e) => { if (selected?.id !== source.id) e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'; }}
                onMouseLeave={(e) => { if (selected?.id !== source.id) e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <div className="w-8 h-8 rounded-[7px] flex items-center justify-center flex-shrink-0" style={channelIconStyle(source.status)}>
                  <IconHash size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="type-panel-title truncate" style={{ color: 'var(--text-primary)' }}>{source.name}</div>
                  <div className="type-caption mt-[1px]" style={{ color: 'var(--text-tertiary)' }}>{source.chunk_count} chunks</div>
                </div>
                <StatusBadge variant={statusVariant(source.status)} label={source.status} />
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {selected ? (
              <div className="max-w-4xl">
                <div className="flex items-center justify-between gap-4 mb-5">
                  <div className="flex items-center gap-3">
                    <h2 className="type-metric-sm" style={{ color: 'var(--text-primary)' }}>{selected.name}</h2>
                    <StatusBadge variant={statusVariant(selected.status)} label={selected.status} />
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => triggerSync(selected.id)}
                    disabled={syncing === selected.id || selected.status === 'syncing'}
                  >
                    <IconRefresh size={13} className={syncing === selected.id ? 'animate-spin' : ''} />
                    {syncing === selected.id ? 'Syncing...' : 'Sync Now'}
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-5">
                  {[
                    { label: 'Chunks', value: selected.chunk_count ?? 0 },
                    { label: 'Last Synced', value: fmtDate(selected.last_synced_at) },
                    { label: 'Provider', value: selected.provider.replace('_', ' ') },
                  ].map((item) => (
                    <div key={item.label} className="rounded-[8px] p-[12px]" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                      <div className="type-caption mb-1" style={{ color: 'var(--text-tertiary)' }}>{item.label}</div>
                      <div className="type-metric-sm capitalize" style={{ color: 'var(--text-primary)' }}>{item.value}</div>
                    </div>
                  ))}
                </div>

                {selected.error_message && (
                  <div className="flex items-start gap-[10px] rounded-[8px] px-[14px] py-3 mb-5 border" style={{ backgroundColor: 'var(--red-bg)', borderColor: 'var(--red-border)' }}>
                    <IconAlertCircle size={16} style={{ color: 'var(--red)', marginTop: 1, flexShrink: 0 }} />
                    <div>
                      <div className="type-panel-title mb-[2px]" style={{ color: 'var(--red-text)' }}>Sync Failed</div>
                      <div className="type-body" style={{ color: 'var(--text-secondary)' }}>{selected.error_message}</div>
                      <button type="button" className="type-body flex items-center gap-[3px] mt-[6px]" style={{ color: 'var(--canon-purple)' }}>
                        <IconArrowRight size={12} /> Fix This Issue
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <div className="type-panel-title mb-2" style={{ color: 'var(--text-primary)' }}>Sync History</div>
                  {[
                    { success: selected.status !== 'error', label: selected.status === 'error' ? 'Sync Failed' : 'Latest Sync Complete', time: fmtDate(selected.last_synced_at), chunks: `${selected.chunk_count ?? 0} Chunks` },
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
                <div className="type-section-title" style={{ color: 'var(--text-secondary)' }}>Select a Channel</div>
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--text-primary)]">Add Slack Channel</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
            <Input
              value={channelSearch}
              onChange={(e) => setChannelSearch(e.target.value)}
              placeholder="Search Channels..."
              className="input-ui pl-9 border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] type-body"
            />
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {channelsLoading ? (
              <div className="space-y-1.5 py-1">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 bg-[var(--bg-secondary)] rounded-lg" />)}
              </div>
            ) : filteredChannels.length === 0 ? (
              <p className="type-body py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>No Channels Found</p>
            ) : (
              filteredChannels.map((channel) => {
                const connected = connectedIds.has(channel.id);
                return (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => !connected && addChannel(channel)}
                    disabled={connected || adding}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-[var(--bg-secondary)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-left cursor-pointer"
                  >
                    <div>
                      <span className="type-panel-title" style={{ color: 'var(--text-primary)' }}>#{channel.name}</span>
                      {channel.member_count > 0 && (
                        <span className="type-caption ml-2" style={{ color: 'var(--text-tertiary)' }}>{channel.member_count} members</span>
                      )}
                    </div>
                    {connected && <StatusBadge variant="delivered" label="Connected" />}
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
