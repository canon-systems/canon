'use client';

import { useState, useEffect, useCallback } from 'react';
import { Database, Plus, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { KnowledgeSource, SlackChannel } from '@/types/onboarding';

function statusBadge(status: string) {
  if (status === 'active') return <Badge className="bg-emerald-500/20 text-emerald-300 border-0 text-xs">Active</Badge>;
  if (status === 'syncing') return <Badge className="bg-blue-500/20 text-blue-300 border-0 text-xs animate-pulse">Syncing</Badge>;
  if (status === 'error') return <Badge className="bg-red-500/20 text-red-300 border-0 text-xs">Error</Badge>;
  return <Badge className="bg-zinc-500/20 text-zinc-300 border-0 text-xs">Pending</Badge>;
}

function fmtDate(d: string | null) {
  if (!d) return 'Never';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
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
      setSources(data.sources ?? []);
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

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48 bg-white/10" />
          <Skeleton className="h-9 w-32 bg-white/10" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 bg-white/10 rounded-xl" />)}
          </div>
          <Skeleton className="lg:col-span-2 h-48 bg-white/10 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Knowledge</h1>
          <p className="text-white/50 text-sm mt-0.5">Slack channels Canon learns from</p>
        </div>
        <Button onClick={openAddModal} size="sm" className="bg-white text-black hover:bg-white/90 flex items-center gap-1.5">
          <Plus className="h-4 w-4" />
          Add channel
        </Button>
      </div>

      {sources.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 py-16 text-center">
          <Database className="h-10 w-10 text-white/20 mb-3" />
          <h3 className="text-white font-medium mb-1">No knowledge sources yet</h3>
          <p className="text-white/40 text-sm mb-5 max-w-sm">Connect Slack channels so Canon can learn from their history and power personalized onboarding messages.</p>
          <Button onClick={openAddModal} size="sm" className="bg-white text-black hover:bg-white/90">Add a channel</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Channel list */}
          <div className="lg:col-span-1 space-y-2">
            {sources.map((source) => (
              <button
                key={source.id}
                onClick={() => setSelected(selected?.id === source.id ? null : source)}
                className={`w-full text-left rounded-xl border p-4 transition-colors ${
                  selected?.id === source.id
                    ? 'border-white/30 bg-white/10'
                    : 'border-white/10 bg-zinc-900 hover:border-white/20'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white text-xs font-bold shrink-0">#</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{source.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {statusBadge(source.status)}
                      {source.chunk_count > 0 && (
                        <span className="text-white/30 text-xs">{source.chunk_count} chunks</span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Preview panel */}
          <div className="lg:col-span-2 rounded-xl border border-white/10 bg-zinc-900 p-6">
            {selected ? (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white">{selected.name}</h2>
                    <p className="text-white/40 text-sm mt-0.5">Last synced: {fmtDate(selected.last_synced_at)}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => triggerSync(selected.id)}
                    disabled={syncing === selected.id || selected.status === 'syncing'}
                    className="border-white/20 text-white/60 hover:bg-white/10 shrink-0 h-8 text-xs"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing === selected.id ? 'animate-spin' : ''}`} />
                    {syncing === selected.id ? 'Syncing...' : 'Sync now'}
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <p className="text-white/40 text-xs uppercase tracking-wide mb-1">Status</p>
                    <div>{statusBadge(selected.status)}</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <p className="text-white/40 text-xs uppercase tracking-wide mb-1">Knowledge chunks</p>
                    <p className="text-white font-semibold">{selected.chunk_count ?? 0}</p>
                  </div>
                </div>

                {selected.error_message && (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                    <p className="text-red-300 text-sm">{selected.error_message}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-48 text-center">
                <Database className="h-8 w-8 text-white/20 mb-3" />
                <p className="text-white/40 text-sm">Select a channel to see details</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add channel modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md bg-zinc-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Add Slack channel</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/30" />
            <Input
              value={channelSearch}
              onChange={(e) => setChannelSearch(e.target.value)}
              placeholder="Search channels..."
              className="pl-9 border-white/10 bg-white/5 text-white placeholder:text-white/30 text-sm"
            />
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {channelsLoading ? (
              <div className="space-y-1.5 py-1">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 bg-white/10 rounded-lg" />)}
              </div>
            ) : filteredChannels.length === 0 ? (
              <p className="text-white/40 text-sm py-6 text-center">No channels found</p>
            ) : (
              filteredChannels.map((channel) => {
                const connected = connectedIds.has(channel.id);
                return (
                  <button
                    key={channel.id}
                    onClick={() => !connected && addChannel(channel)}
                    disabled={connected || adding}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-left"
                  >
                    <div>
                      <span className="text-white text-sm font-medium">#{channel.name}</span>
                      {channel.member_count > 0 && (
                        <span className="text-white/40 text-xs ml-2">{channel.member_count} members</span>
                      )}
                    </div>
                    {connected && <Badge className="bg-emerald-500/20 text-emerald-300 border-0 text-xs shrink-0">Connected</Badge>}
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
