'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  IconArchive,
  IconArrowRight,
  IconBrain,
  IconCheck,
  IconChevronDown,
  IconDotsVertical,
  IconExternalLink,
  IconHash,
  IconPencil,
  IconRadar,
  IconSend,
  IconShieldCheck,
  IconUser,
  IconUsers,
} from '@tabler/icons-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge, type BadgeVariant } from '@/components/ui/status-badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/components/ui/utils';
import type { ReadinessBrief, ReadinessCategory, ReadinessItem, ReadinessStatus } from '@/types/onboarding';

const categories = [
  { id: 'product_change' as const, label: 'Product' },
  { id: 'customer_objection' as const, label: 'Objections' },
  { id: 'demo_guidance' as const, label: 'Demo' },
  { id: 'implementation_pattern' as const, label: 'Implementation' },
];

const statusBadge: Record<ReadinessStatus, BadgeVariant> = {
  draft: 'pending',
  reviewed: 'custom',
  sent: 'delivered',
  archived: 'completed',
};

const statusLabels: Record<ReadinessStatus, string> = {
  draft: 'Draft',
  reviewed: 'Unsent',
  sent: 'Sent',
  archived: 'Archived',
};

function metadataStringArray(item: ReadinessItem, key: string) {
  const value = item.source_metadata?.[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : [];
}

function metadataNumber(item: ReadinessItem, key: string) {
  const value = item.source_metadata?.[key];
  return typeof value === 'number' ? value : 0;
}

type SourceEvidence = {
  label: string;
  url: string | null;
};

type SlackChannelOption = {
  id: string;
  name: string;
  member_count: number;
};

type SlackUserOption = {
  id: string;
  name: string;
  email: string | null;
};

function slackMessageUrl(channelId: string, messageTs: string | null) {
  const params = new URLSearchParams({ channel: channelId });
  if (messageTs) params.set('message_ts', messageTs);
  return `https://slack.com/app_redirect?${params.toString()}`;
}

function sourceEvidence(item: ReadinessItem | null): SourceEvidence[] {
  if (!item) return [];

  const metadataEvidence = item.source_metadata?.source_evidence;
  if (Array.isArray(metadataEvidence)) {
    const evidence = metadataEvidence.flatMap((entry): SourceEvidence[] => {
      if (!entry || typeof entry !== 'object') return [];
      const source = entry as Record<string, unknown>;
      const channelName = typeof source.channel_name === 'string' ? source.channel_name.replace(/^#/, '') : null;
      const channelId = typeof source.channel_id === 'string' ? source.channel_id : null;
      const messageTs = typeof source.message_ts === 'string' ? source.message_ts : null;
      const url = typeof source.url === 'string' ? source.url : channelId ? slackMessageUrl(channelId, messageTs) : null;
      const label = channelName ? `#${channelName}` : item.source === 'slack' ? 'Slack evidence' : item.source ?? 'Source';
      return [{ label, url }];
    });
    if (evidence.length > 0) return evidence;
  }

  const channelNames = metadataStringArray(item, 'channel_names');
  const channelIds = metadataStringArray(item, 'channel_ids');
  if (channelNames.length > 0) {
    return channelNames.map((channelName, index) => {
      const channelId = channelIds[index] ?? channelIds[0] ?? null;
      return {
        label: `#${channelName.replace(/^#/, '')}`,
        url: channelId ? slackMessageUrl(channelId, null) : null,
      };
    });
  }

  const sourceNames = metadataStringArray(item, 'source_names');
  if (sourceNames.length > 0) return sourceNames.map((sourceName) => ({ label: sourceName, url: null }));

  if (item.source === 'slack') return [{ label: 'Slack knowledge', url: null }];
  return [{ label: item.source ?? 'Source', url: null }];
}

function formatDate(value: string | null) {
  if (!value) return 'Not sent';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value));
}

function preventionText(item: ReadinessItem | null) {
  if (!item) return 'Select a signal to see the risk Canon should prevent.';
  if (item.category === 'customer_objection') return 'Inconsistent customer answers and late-stage deal hesitation.';
  if (item.category === 'demo_guidance') return 'Stale demos and missed proof points in live calls.';
  if (item.category === 'implementation_pattern') return 'Repeated delivery delays and unclear kickoff ownership.';
  return 'Outdated product context in demos, POCs, and launch conversations.';
}

function nextAction(item: ReadinessItem | null) {
  if (!item) return 'Select a readiness signal.';
  if (item.recommended_action) return item.recommended_action;
  if (item.category === 'customer_objection') return 'Send the approved response and assign a technical owner.';
  if (item.category === 'demo_guidance') return 'Send the updated demo note and refresh the talk track.';
  if (item.category === 'implementation_pattern') return 'Send implementation guidance and update the kickoff checklist.';
  return 'Send a role-specific product update and review affected ramp milestones.';
}

function selectedCategoryLabel(selectedCategories: ReadinessCategory[]) {
  if (selectedCategories.length === 0) return 'No categories';
  if (selectedCategories.length === categories.length) return 'All categories';
  if (selectedCategories.length === 1) {
    return categories.find((category) => category.id === selectedCategories[0])?.label ?? 'Category';
  }
  return `${selectedCategories.length} categories`;
}

function selectedChannelLabel(selectedChannelIds: string[], channelOptions: SlackChannelOption[]) {
  if (selectedChannelIds.length === 0) return 'No channels';
  if (selectedChannelIds.length === 1) {
    const ch = channelOptions.find((c) => c.id === selectedChannelIds[0]);
    return ch ? `#${ch.name}` : '1 channel';
  }
  return `${selectedChannelIds.length} channels`;
}

function selectedUserLabel(selectedUserIds: string[], users: SlackUserOption[]) {
  if (selectedUserIds.length === 0) return 'No DMs';
  if (selectedUserIds.length === 1) {
    const selectedId = selectedUserIds[0];
    if (selectedId.startsWith('D')) return 'DM channel';
    return users.find((user) => user.id === selectedId)?.name ?? '1 DM';
  }
  return `${selectedUserIds.length} DMs`;
}

function StepRow({
  icon: Icon,
  label,
  children,
  tone = 'default',
  divider = true,
}: {
  icon: typeof IconRadar;
  label: string;
  children: React.ReactNode;
  tone?: 'default' | 'warning' | 'action';
  divider?: boolean;
}) {
  const color = tone === 'warning' ? 'var(--amber)' : tone === 'action' ? 'var(--canon-purple)' : 'var(--text-tertiary)';
  const bg = tone === 'warning' ? 'var(--amber-bg-subtle)' : tone === 'action' ? 'var(--canon-purple-light)' : 'var(--bg-secondary)';

  return (
    <div className="grid gap-3 sm:grid-cols-[30px_minmax(0,1fr)]">
      <div className="size-7 rounded-[7px] flex items-center justify-center" style={{ backgroundColor: bg, color }}>
        <Icon size={15} />
      </div>
      <div className={divider ? 'min-w-0 border-b pb-5' : 'min-w-0'} style={{ borderColor: 'var(--border-tertiary)' }}>
        <div className="type-kicker mb-2" style={{ color: 'var(--text-tertiary)' }}>{label}</div>
        {children}
      </div>
    </div>
  );
}

export function ReadinessClient() {
  const [brief, setBrief] = useState<ReadinessBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategories, setActiveCategories] = useState<ReadinessCategory[]>(categories.map((category) => category.id));
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedSignalIds, setSelectedSignalIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'signals' | 'delivery'>('signals');
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [rowActionId, setRowActionId] = useState<string | null>(null);
  const [channels, setChannels] = useState<SlackChannelOption[]>([]);
  const [slackUsers, setSlackUsers] = useState<SlackUserOption[]>([]);
  const [slackUsersReconnectRequired, setSlackUsersReconnectRequired] = useState(false);
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [savingDeliverySettings, setSavingDeliverySettings] = useState(false);

  async function generateSignals() {
    setGenerating(true);
    const requestedAt = Date.now();
    try {
      const response = await fetch('/api/onboarding/readiness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate' }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; detail?: string };
      if (!response.ok) {
        throw new Error(result.detail || result.error || 'Failed to queue readiness analysis');
      }

      toast.success('Readiness analysis queued');

      await new Promise<void>((resolve) => {
        let attempts = 0;
        const interval = window.setInterval(async () => {
          attempts++;
          try {
            const res = await fetch('/api/onboarding/readiness');
            const data = (await res.json()) as { brief?: ReadinessBrief | null };
            const next = data.brief;
            const newestUpdate = Math.max(
              ...(next?.items ?? []).map((item) => new Date(item.updated_at || item.detected_at || item.created_at).getTime()),
              0
            );
            if (newestUpdate >= requestedAt || attempts >= 20) {
              clearInterval(interval);
              setBrief(next ?? null);
              if (newestUpdate >= requestedAt) {
                toast.success('Readiness signals are ready for review');
              }
              resolve();
            }
          } catch {
            if (attempts >= 20) { clearInterval(interval); resolve(); }
          }
        }, 3000);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not generate readiness signals. Please try again.';
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  }

  async function loadReadiness() {
    try {
      const res = await fetch('/api/onboarding/readiness');
      const data = (await res.json()) as { brief?: ReadinessBrief | null };
      setBrief(data.brief ?? null);
    } catch {
      setBrief(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/onboarding/readiness');
        const data = (await res.json()) as { brief?: ReadinessBrief | null };
        if (!cancelled) setBrief(data.brief ?? null);
      } catch {
        if (!cancelled) setBrief(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDeliveryOptions() {
      const [channelsResult, usersResult, settingsResult] = await Promise.allSettled([
        fetch('/api/onboarding/slack/channels').then((res) => res.json() as Promise<{ channels?: SlackChannelOption[] }>),
        fetch('/api/onboarding/slack/users').then((res) => res.json() as Promise<{
          users?: SlackUserOption[];
          reconnect_required?: boolean;
        }>),
        fetch('/api/onboarding/readiness/delivery-settings').then((res) => res.json() as Promise<{
          settings?: { channelIds?: string[]; userIds?: string[] } | null;
        }>),
      ]);

      if (cancelled) return;

      if (channelsResult.status === 'fulfilled') setChannels(channelsResult.value.channels ?? []);
      if (usersResult.status === 'fulfilled') {
        setSlackUsers(usersResult.value.users ?? []);
        setSlackUsersReconnectRequired(Boolean(usersResult.value.reconnect_required));
      }
      if (settingsResult.status === 'fulfilled' && settingsResult.value.settings) {
        setSelectedChannelIds(settingsResult.value.settings.channelIds ?? []);
        setSelectedUserIds(settingsResult.value.settings.userIds ?? []);
      }
    }

    void loadDeliveryOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(() => brief?.items ?? [], [brief]);
  const categoryItems = useMemo(() => items.filter((item) => activeCategories.includes(item.category)), [activeCategories, items]);
  const selectedItem = useMemo(
    () => categoryItems.find((item) => item.id === selectedItemId) ?? categoryItems[0] ?? null,
    [categoryItems, selectedItemId]
  );
  const unsentCategoryItems = useMemo(
    () => categoryItems.filter((item) => item.status === 'draft' || item.status === 'reviewed'),
    [categoryItems]
  );
  const categoryCounts = useMemo(
    () => new Map(categories.map((category) => [category.id, items.filter((item) => item.category === category.id).length])),
    [items]
  );
  const hasDeliveryTargets = selectedChannelIds.length > 0 || selectedUserIds.length > 0;
  const allCategoriesSelected = activeCategories.length === categories.length;
  const filterLabel = selectedCategoryLabel(activeCategories);
  const selectedSignalCount = selectedSignalIds.size;
  const hasSignalSelection = selectedSignalCount > 0;
  const selectedVisibleSignalCount = useMemo(
    () => categoryItems.filter((item) => selectedSignalIds.has(item.id)).length,
    [categoryItems, selectedSignalIds]
  );
  const allSignalsSelected = categoryItems.length > 0 && selectedVisibleSignalCount === categoryItems.length;
  const selectedUnsentSignalCount = useMemo(
    () => categoryItems.filter((item) => selectedSignalIds.has(item.id) && (item.status === 'draft' || item.status === 'reviewed')).length,
    [categoryItems, selectedSignalIds]
  );

  useEffect(() => {
    if (!selectedItem || selectedItem.id === selectedItemId) return;
    setSelectedItemId(selectedItem.id);
  }, [selectedItem, selectedItemId]);

  useEffect(() => {
    setSelectedSignalIds((current) => {
      const visibleIds = new Set(categoryItems.map((item) => item.id));
      const next = new Set(Array.from(current).filter((id) => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [categoryItems]);

  function requireDeliveryTargets() {
    if (hasDeliveryTargets) return true;
    toast.error('No delivery targets set', { description: 'Choose at least one channel or user in the Delivery tab before sending.' });
    setActiveTab('delivery');
    return false;
  }

  async function sendSignal(item: ReadinessItem) {
    if (!requireDeliveryTargets()) return;
    setRowActionId(item.id);
    try {
      const res = await fetch('/api/onboarding/readiness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemIds: [item.id],
          channelIds: selectedChannelIds,
          userIds: selectedUserIds,
        }),
      });
      const data = (await res.json()) as { error?: string; detail?: string };
      if (!res.ok) throw new Error(data.detail || data.error || 'Failed to send readiness signal');
      await loadReadiness();
      setSelectedItemId(item.id);
      toast.success('Signal sent');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send readiness signal');
    } finally {
      setRowActionId(null);
    }
  }

  async function updateSignalStatus(item: ReadinessItem, status: ReadinessStatus) {
    setRowActionId(item.id);
    try {
      const res = await fetch('/api/onboarding/readiness', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, status }),
      });
      const data = (await res.json()) as { error?: string; detail?: string };
      if (!res.ok) throw new Error(data.detail || data.error || 'Failed to update readiness signal');
      await loadReadiness();
      setSelectedItemId(status === 'archived' ? null : item.id);
      const label = status === 'archived' ? 'Signal archived' : status === 'reviewed' ? 'Marked as reviewed' : 'Status updated';
      toast.success(label);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update readiness signal');
    } finally {
      setRowActionId(null);
    }
  }

  async function saveDeliverySettings() {
    setSavingDeliverySettings(true);
    try {
      const channelNames = selectedChannelIds
        .map((id) => channels.find((ch) => ch.id === id)?.name ?? '')
        .filter(Boolean);
      const res = await fetch('/api/onboarding/readiness/delivery-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelIds: selectedChannelIds,
          channelNames,
          userIds: selectedUserIds,
        }),
      });
      const data = (await res.json()) as { error?: string; detail?: string };
      if (!res.ok) throw new Error(data.detail || data.error || 'Failed to save delivery settings');
      toast.success('Delivery targets saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save delivery settings');
    } finally {
      setSavingDeliverySettings(false);
    }
  }

  function toggleCategory(category: ReadinessCategory) {
    setActiveCategories((current) => {
      const next = current.includes(category)
        ? current.filter((selectedCategory) => selectedCategory !== category)
        : [...current, category];
      return next;
    });
  }

  function toggleChannel(channelId: string) {
    setSelectedChannelIds((current) => (
      current.includes(channelId)
        ? current.filter((id) => id !== channelId)
        : [...current, channelId]
    ));
  }

  function toggleUser(userId: string) {
    setSelectedUserIds((current) => (
      current.includes(userId)
        ? current.filter((selectedUserId) => selectedUserId !== userId)
        : [...current, userId]
    ));
  }

  function toggleSignalSelection(signalId: string) {
    setSelectedSignalIds((current) => {
      const next = new Set(current);
      if (next.has(signalId)) next.delete(signalId);
      else next.add(signalId);
      return next;
    });
  }

  function toggleAllSignals() {
    setSelectedSignalIds((current) => (
      categoryItems.length > 0 && categoryItems.every((item) => current.has(item.id))
        ? new Set()
        : new Set(categoryItems.map((item) => item.id))
    ));
  }

  async function sendSelectedSignals() {
    if (!requireDeliveryTargets()) return;
    const itemIds = categoryItems
      .filter((item) => selectedSignalIds.has(item.id) && (item.status === 'draft' || item.status === 'reviewed'))
      .map((item) => item.id);
    if (itemIds.length === 0) return;

    setSending(true);
    try {
      const res = await fetch('/api/onboarding/readiness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemIds,
          channelIds: selectedChannelIds,
          userIds: selectedUserIds,
        }),
      });
      const data = (await res.json()) as { error?: string; detail?: string };
      if (!res.ok) throw new Error(data.detail || data.error || 'Failed to send selected signals');
      await loadReadiness();
      setSelectedSignalIds(new Set());
      setSelectedItemId(null);
      toast.success(itemIds.length === 1 ? 'Signal sent' : `${itemIds.length} signals sent`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send selected signals');
    } finally {
      setSending(false);
    }
  }

  async function updateSelectedSignalStatus(status: ReadinessStatus) {
    const selectedItems = categoryItems.filter((item) => selectedSignalIds.has(item.id));
    if (selectedItems.length === 0) return;

    setRowActionId('bulk');
    try {
      for (const item of selectedItems) {
        const res = await fetch('/api/onboarding/readiness', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id, status }),
        });
        const data = (await res.json()) as { error?: string; detail?: string };
        if (!res.ok) throw new Error(data.detail || data.error || 'Failed to update selected signals');
      }

      await loadReadiness();
      setSelectedSignalIds(new Set());
      if (status === 'archived') setSelectedItemId(null);
      const count = selectedItems.length;
      const label = status === 'archived'
        ? `${count} signal${count !== 1 ? 's' : ''} archived`
        : `${count} signal${count !== 1 ? 's' : ''} updated`;
      toast.success(label);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update selected signals');
    } finally {
      setRowActionId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--border-tertiary)' }}>
          <Skeleton className="h-8 w-44 bg-[var(--bg-primary)]" />
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="split-sidebar w-[340px] flex-shrink-0 border-r flex flex-col gap-3 p-4">
            <Skeleton className="h-8 bg-[var(--bg-primary)]" />
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 rounded-[8px] bg-[var(--bg-primary)]" />)}
          </div>
          <div className="flex-1 p-8">
            <Skeleton className="h-full rounded-[10px] bg-[var(--bg-primary)]" />
          </div>
        </div>
      </div>
    );
  }

  const signalsReviewed = selectedItem ? metadataNumber(selectedItem, 'signals_reviewed') : 0;
  const evidenceSources = sourceEvidence(selectedItem);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b" style={{ borderColor: 'var(--border-tertiary)' }}>
        <div>
          <h1 className="type-page-title" style={{ color: 'var(--text-primary)' }}>Readiness</h1>
        </div>
        <Button size="sm" onClick={generateSignals} disabled={generating} className="mt-1">
          <IconBrain size={13} /> {generating ? 'Generating...' : 'Generate Signals'}
        </Button>
      </div>

      {!brief ? (
        generating ? (
          <div className="flex flex-col gap-4 px-6 py-6 flex-1 overflow-y-auto">
            <div className="flex items-center gap-2 type-body" style={{ color: 'var(--text-tertiary)' }}>
              <IconBrain size={14} style={{ color: 'var(--canon-purple)', flexShrink: 0 }} />
              Analyzing your knowledge sources for readiness signals…
            </div>
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 rounded-[10px] bg-[var(--bg-primary)]" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 py-12">
            <IconRadar size={32} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
            <div className="type-section-title" style={{ color: 'var(--text-secondary)' }}>No Readiness Signals</div>
            <div className="type-body text-center max-w-[280px] leading-[1.5]" style={{ color: 'var(--text-tertiary)' }}>
              Signals are generated from your knowledge sources. Add a source to get started.
            </div>
            <Link href="/knowledge">
              <Button size="sm" className="mt-1">Add Knowledge Sources</Button>
            </Link>
          </div>
        )
      ) : (
        <div className="flex flex-1 overflow-hidden">

          {/* Left sidebar — signal list + delivery settings */}
          <div className="split-sidebar w-[340px] flex-shrink-0 border-r flex flex-col overflow-hidden">
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as 'signals' | 'delivery')}
              className="flex flex-col flex-1 min-h-0"
            >
              <div
                className="split-header flex items-center border-b shrink-0"
                style={{ borderColor: 'var(--border-tertiary)' }}
              >
                <TabsList className="split-tabbar border-b-0 px-3">
                  <TabsTrigger value="signals">
                    Signals
                    <span className="ml-1.5 type-caption opacity-60">{items.length}</span>
                  </TabsTrigger>
                  <TabsTrigger value="delivery">Delivery</TabsTrigger>
                </TabsList>
                {activeTab === 'signals' && (
                  <div className="ml-auto pr-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 w-[148px] justify-between shrink-0">
                          <span className="truncate">{filterLabel}</span>
                          <IconChevronDown size={13} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          <DropdownMenuItem
                            role="menuitemcheckbox"
                            aria-checked={allCategoriesSelected}
                            onSelect={(e) => { e.preventDefault(); setActiveCategories(allCategoriesSelected ? [] : categories.map((c) => c.id)); }}
                          >
                            <span className="flex h-4 w-4 items-center justify-center">
                              {allCategoriesSelected && <IconCheck size={13} />}
                            </span>
                            <span className="flex-1">All</span>
                            <span className="type-caption tabular-nums" style={{ color: 'var(--text-tertiary)' }}>{items.length}</span>
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                          {categories.map((category) => (
                            <DropdownMenuItem
                              key={category.id}
                              role="menuitemcheckbox"
                              aria-checked={activeCategories.includes(category.id)}
                              onSelect={(e) => { e.preventDefault(); toggleCategory(category.id); }}
                            >
                              <span className="flex h-4 w-4 items-center justify-center">
                                {activeCategories.includes(category.id) && <IconCheck size={13} />}
                              </span>
                              <span className="flex-1">{category.label}</span>
                              <span className="type-caption tabular-nums" style={{ color: 'var(--text-tertiary)' }}>{categoryCounts.get(category.id) ?? 0}</span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>

              <TabsContent value="signals" className="flex flex-col flex-1 min-h-0 overflow-hidden m-0">
                {/* Bulk action toolbar */}
                <div
                  className="sticky top-0 z-10 border-b px-[14px] py-[10px] shrink-0"
                  style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-tertiary)' }}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={allSignalsSelected}
                      ref={(input) => {
                        if (input) input.indeterminate = hasSignalSelection && !allSignalsSelected;
                      }}
                      onChange={toggleAllSignals}
                      disabled={categoryItems.length === 0}
                      className="h-4 w-4 flex-shrink-0 accent-[var(--canon-purple)] disabled:opacity-40"
                      aria-label={allSignalsSelected ? 'Clear signal selection' : 'Select all signals'}
                      aria-checked={hasSignalSelection && !allSignalsSelected ? 'mixed' : allSignalsSelected}
                    />
                    <div className="min-w-0 flex-1 type-caption font-medium" style={{ color: 'var(--text-secondary)' }}>
                      {hasSignalSelection ? `${selectedSignalCount} selected` : ''}
                    </div>
                    <TooltipProvider delayDuration={120}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void sendSelectedSignals()}
                            disabled={!hasSignalSelection || selectedUnsentSignalCount === 0 || sending || rowActionId === 'bulk'}
                            aria-label="Send selected signals"
                          >
                            <IconSend size={14} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          {!hasDeliveryTargets ? 'Set delivery targets in the Delivery tab first' : 'Send selected signals'}
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void updateSelectedSignalStatus('reviewed')}
                            disabled={!hasSignalSelection || rowActionId === 'bulk'}
                            aria-label="Mark selected unsent"
                          >
                            <IconPencil size={14} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Mark selected unsent</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void updateSelectedSignalStatus('sent')}
                            disabled={!hasSignalSelection || rowActionId === 'bulk'}
                            aria-label="Mark selected sent"
                          >
                            <IconCheck size={14} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Mark selected sent</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void updateSelectedSignalStatus('archived')}
                            disabled={!hasSignalSelection || rowActionId === 'bulk'}
                            aria-label="Archive selected signals"
                            className="text-[var(--red)] hover:text-[var(--red)]"
                          >
                            <IconArchive size={14} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Archive selected signals</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>

                {!hasDeliveryTargets && (
                  <div className="px-3 pt-3">
                    <button
                      type="button"
                      onClick={() => setActiveTab('delivery')}
                      className="w-full rounded-[8px] border px-3 py-2 type-caption text-left"
                      style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-secondary)', color: 'var(--text-secondary)' }}
                    >
                      No delivery targets set — configure channels or users in the{' '}
                      <span style={{ color: 'var(--canon-purple)' }}>Delivery tab</span>{' '}
                      before sending.
                    </button>
                  </div>
                )}

                {/* Signal list */}
                <div className="flex-1 overflow-y-auto">
                  {categoryItems.length === 0 ? (
                    <div className="p-3">
                      <Alert>
                        <IconRadar size={15} />
                        <AlertTitle>{activeCategories.length === 0 ? 'No categories selected' : 'No active signals'}</AlertTitle>
                        <AlertDescription>
                          {activeCategories.length === 0 ? 'Select at least one category to view readiness signals.' : 'This filter is clear for now.'}
                        </AlertDescription>
                      </Alert>
                    </div>
                  ) : (
                    categoryItems.map((item) => (
                      <div
                        key={item.id}
                        className={cn(
                          'list-row flex items-center gap-2 border-b',
                          selectedItem?.id === item.id && 'list-row-selected'
                        )}
                        style={{ padding: '10px 14px' }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedSignalIds.has(item.id)}
                          onChange={() => toggleSignalSelection(item.id)}
                          className="h-4 w-4 flex-shrink-0 accent-[var(--canon-purple)]"
                          aria-label={`Select ${item.title}`}
                        />
                        <button
                          type="button"
                          onClick={() => setSelectedItemId(item.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="type-panel-title truncate" style={{ color: 'var(--text-primary)' }}>{item.title}</div>
                          <div className="type-caption mt-[1px]" style={{ color: 'var(--text-tertiary)' }}>
                            {item.affected_roles.length} role{item.affected_roles.length === 1 ? '' : 's'} · {formatDate(item.sent_at)}
                          </div>
                        </button>
                        <StatusBadge variant={statusBadge[item.status]} label={statusLabels[item.status]} />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="shrink-0"
                              aria-label={`Actions for ${item.title}`}
                              disabled={rowActionId === item.id || rowActionId === 'bulk'}
                            >
                              <IconDotsVertical size={14} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-[190px]">
                            <DropdownMenuGroup>
                              <DropdownMenuItem onSelect={() => void sendSignal(item)} disabled={item.status === 'sent' || rowActionId === item.id || rowActionId === 'bulk'}>
                                <IconSend size={14} />
                                Send this signal
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuGroup>
                              <DropdownMenuItem onSelect={() => void updateSignalStatus(item, 'draft')} disabled={item.status === 'draft' || rowActionId === item.id || rowActionId === 'bulk'}>
                                <IconPencil size={14} />
                                Mark draft
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => void updateSignalStatus(item, 'reviewed')} disabled={item.status === 'reviewed' || rowActionId === item.id || rowActionId === 'bulk'}>
                                <IconCheck size={14} />
                                Mark unsent
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => void updateSignalStatus(item, 'sent')} disabled={item.status === 'sent' || rowActionId === item.id || rowActionId === 'bulk'}>
                                <IconCheck size={14} />
                                Mark sent
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => void updateSignalStatus(item, 'archived')} disabled={item.status === 'archived' || rowActionId === item.id || rowActionId === 'bulk'}>
                                <IconArchive size={14} />
                                Archive
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>

              <TabsContent value="delivery" className="flex-1 overflow-y-auto p-4 space-y-3 m-0">
                <p className="type-caption" style={{ color: 'var(--text-tertiary)' }}>
                  Set default channels and DMs for automatic signal delivery.
                </p>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-full justify-between">
                      <span className="flex min-w-0 items-center gap-2">
                        <IconHash size={14} />
                        <span className="truncate">{selectedChannelLabel(selectedChannelIds, channels)}</span>
                      </span>
                      <IconChevronDown size={14} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {channels.length === 0 ? (
                      <DropdownMenuItem disabled>No channels found</DropdownMenuItem>
                    ) : (
                      <DropdownMenuGroup>
                        {channels.map((ch) => (
                          <DropdownMenuItem
                            key={ch.id}
                            role="menuitemcheckbox"
                            aria-checked={selectedChannelIds.includes(ch.id)}
                            onSelect={(e) => { e.preventDefault(); toggleChannel(ch.id); }}
                          >
                            <span className="flex h-4 w-4 items-center justify-center">
                              {selectedChannelIds.includes(ch.id) && <IconCheck size={13} />}
                            </span>
                            <span className="min-w-0 flex-1 truncate">#{ch.name}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-full justify-between">
                      <span className="flex min-w-0 items-center gap-2">
                        <IconUser size={14} />
                        <span className="truncate">{selectedUserLabel(selectedUserIds, slackUsers)}</span>
                      </span>
                      <IconChevronDown size={14} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {slackUsersReconnectRequired ? (
                      <DropdownMenuItem disabled>Reconnect Slack to enable DMs</DropdownMenuItem>
                    ) : slackUsers.length === 0 ? (
                      <DropdownMenuItem disabled>No Slack users found</DropdownMenuItem>
                    ) : (
                      <DropdownMenuGroup>
                        {slackUsers.map((slackUser) => (
                          <DropdownMenuItem
                            key={slackUser.id}
                            role="menuitemcheckbox"
                            aria-checked={selectedUserIds.includes(slackUser.id)}
                            onSelect={(e) => { e.preventDefault(); toggleUser(slackUser.id); }}
                          >
                            <span className="flex h-4 w-4 items-center justify-center">
                              {selectedUserIds.includes(slackUser.id) && <IconCheck size={13} />}
                            </span>
                            <span className="min-w-0 flex-1 truncate">{slackUser.name}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={saveDeliverySettings}
                  disabled={savingDeliverySettings}
                  className="w-full"
                >
                  {savingDeliverySettings ? 'Saving...' : 'Save Targets'}
                </Button>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right panel — signal detail */}
          <div className="surface-page flex-1 min-w-0 flex flex-col overflow-hidden">
            {selectedItem ? (
              <>
                <div className="split-header px-8 pt-6 pb-5 border-b" style={{ borderColor: 'var(--border-tertiary)' }}>
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge
                        variant={statusBadge[selectedItem.status]}
                        label={statusLabels[selectedItem.status]}
                      />
                      <span className="type-body" style={{ color: 'var(--text-tertiary)' }}>
                        {formatDate(selectedItem.sent_at)}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => void sendSignal(selectedItem)}
                      disabled={rowActionId === selectedItem.id || selectedItem.status === 'sent'}
                    >
                      <IconSend size={13} />
                      {rowActionId === selectedItem.id ? 'Sending...' : selectedItem.status === 'sent' ? 'Sent' : 'Send Signal'}
                    </Button>
                  </div>
                  <h2 className="type-detail-title" style={{ color: 'var(--text-primary)' }}>
                    {selectedItem.title}
                  </h2>
                  {selectedItem.affected_roles.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {selectedItem.affected_roles.map((role) => (
                        <span
                          key={role}
                          className="type-control-sm rounded-[4px] px-[7px] py-[3px]"
                          style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-tertiary)' }}
                        >
                          {role}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto px-8 py-6">
                  <div className="grid gap-5">
                    <StepRow icon={IconRadar} label="1. Detect change">
                      <p className="type-card-body" style={{ color: 'var(--text-secondary)' }}>
                        {selectedItem.summary}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 type-caption" style={{ color: 'var(--text-tertiary)' }}>
                        <span>Sources:</span>
                        {evidenceSources.map((source, index) => (
                          source.url ? (
                            <a
                              key={`${source.label}-${index}`}
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[var(--text-secondary)] transition-colors duration-[120ms] hover:text-[var(--text-primary)]"
                            >
                              {source.label}
                              <IconExternalLink size={11} />
                            </a>
                          ) : (
                            <span key={`${source.label}-${index}`} className="text-[var(--text-secondary)]">{source.label}</span>
                          )
                        ))}
                        <span>· {signalsReviewed} signal{signalsReviewed === 1 ? '' : 's'} reviewed</span>
                      </div>
                    </StepRow>

                    <StepRow icon={IconShieldCheck} label="2. Explain impact" tone="warning">
                      <p className="type-card-body" style={{ color: 'var(--text-secondary)' }}>{preventionText(selectedItem)}</p>
                    </StepRow>

                    <StepRow icon={IconUsers} label="3. Identify audience">
                      <div className="flex flex-wrap gap-2">
                        {selectedItem.affected_roles.length === 0 ? (
                          <span className="type-body" style={{ color: 'var(--text-tertiary)' }}>No affected roles.</span>
                        ) : selectedItem.affected_roles.map((role) => (
                          <span
                            key={role}
                            className="type-control-sm rounded-[4px] px-[7px] py-[3px]"
                            style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-tertiary)' }}
                          >
                            {role}
                          </span>
                        ))}
                      </div>
                    </StepRow>

                    <StepRow icon={IconArrowRight} label="4. Recommend action" tone="action">
                      <p className="type-card-body" style={{ color: 'var(--text-secondary)' }}>{nextAction(selectedItem)}</p>
                    </StepRow>

                    <StepRow icon={selectedItem.status === 'sent' ? IconCheck : IconSend} label="5. Send or prevent" divider={false}>
                      <p className="type-card-body" style={{ color: 'var(--text-secondary)' }}>
                        {selectedItem.status === 'sent'
                          ? `Sent ${formatDate(selectedItem.sent_at)}.`
                          : `${unsentCategoryItems.length} update${unsentCategoryItems.length === 1 ? '' : 's'} ready in this filter.`}
                      </p>
                    </StepRow>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
                <IconRadar size={32} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
                <div className="type-section-title" style={{ color: 'var(--text-secondary)' }}>No Signal Selected</div>
                <div className="type-body text-center max-w-[240px] leading-[1.5]" style={{ color: 'var(--text-tertiary)' }}>
                  Choose a readiness signal from the list to review its details.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
