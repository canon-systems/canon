'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  IconArrowRight,
  IconArchive,
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
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge, type BadgeVariant } from '@/components/ui/status-badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { HireRole, ReadinessBrief, ReadinessCategory, ReadinessImpactLevel, ReadinessItem, ReadinessStatus } from '@/types/onboarding';

const categories = [
  { id: 'product_change' as const, label: 'Product' },
  { id: 'customer_objection' as const, label: 'Objections' },
  { id: 'demo_guidance' as const, label: 'Demo' },
  { id: 'implementation_pattern' as const, label: 'Implementation' },
];

const impactRank: Record<ReadinessImpactLevel, number> = { high: 3, medium: 2, low: 1 };
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

function affectedAudience(items: ReadinessItem[]) {
  const roles = new Map<HireRole, { role: HireRole; count: number; impact: ReadinessImpactLevel }>();

  for (const item of items) {
    for (const role of item.affected_roles) {
      const current = roles.get(role) ?? { role, count: 0, impact: 'low' as ReadinessImpactLevel };
      current.count += 1;
      if (impactRank[item.impact_level] > impactRank[current.impact]) current.impact = item.impact_level;
      roles.set(role, current);
    }
  }

  return Array.from(roles.values()).sort((a, b) => {
    const impactDiff = impactRank[b.impact] - impactRank[a.impact];
    return impactDiff !== 0 ? impactDiff : b.count - a.count;
  });
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

function selectedUserLabel(selectedUserIds: string[], users: SlackUserOption[]) {
  if (selectedUserIds.length === 0) return 'No DMs';
  if (selectedUserIds.length === 1) {
    const selectedId = selectedUserIds[0];
    if (selectedId.startsWith('D')) return 'DM channel';
    return users.find((user) => user.id === selectedId)?.name ?? '1 DM';
  }
  return `${selectedUserIds.length} DMs`;
}

function normalizeDmTarget(value: string) {
  const normalized = value.trim().toUpperCase();
  if (normalized === 'USLACKBOT') return null;
  return /^[DU][A-Z0-9]+$/.test(normalized) ? normalized : null;
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
  const [sending, setSending] = useState(false);
  const [rowActionId, setRowActionId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [channels, setChannels] = useState<SlackChannelOption[]>([]);
  const [slackUsers, setSlackUsers] = useState<SlackUserOption[]>([]);
  const [slackUsersReconnectRequired, setSlackUsersReconnectRequired] = useState(false);
  const [deliveryChannelId, setDeliveryChannelId] = useState('auto');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [dmTargetInput, setDmTargetInput] = useState('');
  const [savingDeliverySettings, setSavingDeliverySettings] = useState(false);
  const [deliverySettingsMessage, setDeliverySettingsMessage] = useState<string | null>(null);

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
          settings?: { channelId?: string; userIds?: string[] } | null;
        }>),
      ]);

      if (cancelled) return;

      if (channelsResult.status === 'fulfilled') setChannels(channelsResult.value.channels ?? []);
      if (usersResult.status === 'fulfilled') {
        setSlackUsers(usersResult.value.users ?? []);
        setSlackUsersReconnectRequired(Boolean(usersResult.value.reconnect_required));
      }
      if (settingsResult.status === 'fulfilled' && settingsResult.value.settings) {
        setDeliveryChannelId(settingsResult.value.settings.channelId ?? 'auto');
        setSelectedUserIds((settingsResult.value.settings.userIds ?? []).flatMap((target) => {
          const normalized = normalizeDmTarget(target);
          return normalized ? [normalized] : [];
        }));
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
  const audience = useMemo(() => affectedAudience(categoryItems), [categoryItems]);
  const unsentCategoryItems = useMemo(
    () => categoryItems.filter((item) => item.status === 'draft' || item.status === 'reviewed'),
    [categoryItems]
  );
  const categoryCounts = useMemo(
    () => new Map(categories.map((category) => [category.id, items.filter((item) => item.category === category.id).length])),
    [items]
  );
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

  async function sendReadinessNote() {
    if (!brief || unsentCategoryItems.length === 0) return;
    setSending(true);
    setSendError(null);

    try {
      const body = allCategoriesSelected
        ? {}
        : activeCategories.length === 1
          ? { category: activeCategories[0] }
          : { categories: activeCategories };
      const deliveryBody = {
        ...body,
        ...(deliveryChannelId !== 'auto' ? { channelId: deliveryChannelId } : {}),
        ...(selectedUserIds.length > 0 ? { userIds: selectedUserIds } : {}),
      };
      const res = await fetch('/api/onboarding/readiness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deliveryBody),
      });
      const data = (await res.json()) as { error?: string; detail?: string };
      if (!res.ok) throw new Error(data.detail || data.error || 'Failed to send readiness note');
      await loadReadiness();
      setSelectedItemId(null);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Failed to send readiness note');
    } finally {
      setSending(false);
    }
  }

  async function sendSignal(item: ReadinessItem) {
    setRowActionId(item.id);
    setSendError(null);

    try {
      const res = await fetch('/api/onboarding/readiness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemIds: [item.id],
          ...(deliveryChannelId !== 'auto' ? { channelId: deliveryChannelId } : {}),
          ...(selectedUserIds.length > 0 ? { userIds: selectedUserIds } : {}),
        }),
      });
      const data = (await res.json()) as { error?: string; detail?: string };
      if (!res.ok) throw new Error(data.detail || data.error || 'Failed to send readiness signal');
      await loadReadiness();
      setSelectedItemId(item.id);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Failed to send readiness signal');
    } finally {
      setRowActionId(null);
    }
  }

  async function updateSignalStatus(item: ReadinessItem, status: ReadinessStatus) {
    setRowActionId(item.id);
    setSendError(null);

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
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Failed to update readiness signal');
    } finally {
      setRowActionId(null);
    }
  }

  async function saveDeliverySettings() {
    setSavingDeliverySettings(true);
    setDeliverySettingsMessage(null);
    setSendError(null);

    try {
      const selectedChannel = channels.find((channel) => channel.id === deliveryChannelId);
      const res = await fetch('/api/onboarding/readiness/delivery-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: deliveryChannelId,
          channelName: selectedChannel?.name ?? null,
          userIds: selectedUserIds,
        }),
      });
      const data = (await res.json()) as { error?: string; detail?: string };
      if (!res.ok) throw new Error(data.detail || data.error || 'Failed to save delivery settings');
      setDeliverySettingsMessage('Automatic delivery targets saved.');
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Failed to save delivery settings');
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

  function toggleUser(userId: string) {
    setSelectedUserIds((current) => (
      current.includes(userId)
        ? current.filter((selectedUserId) => selectedUserId !== userId)
        : [...current, userId]
    ));
  }

  function addDmTarget() {
    const normalized = normalizeDmTarget(dmTargetInput);
    if (!normalized) return;
    setSelectedUserIds((current) => current.includes(normalized) ? current : [...current, normalized]);
    setDmTargetInput('');
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

  function clearSignalSelection() {
    setSelectedSignalIds(new Set());
  }

  async function sendSelectedSignals() {
    const itemIds = categoryItems
      .filter((item) => selectedSignalIds.has(item.id) && (item.status === 'draft' || item.status === 'reviewed'))
      .map((item) => item.id);
    if (itemIds.length === 0) return;

    setSending(true);
    setSendError(null);

    try {
      const res = await fetch('/api/onboarding/readiness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemIds,
          ...(deliveryChannelId !== 'auto' ? { channelId: deliveryChannelId } : {}),
          ...(selectedUserIds.length > 0 ? { userIds: selectedUserIds } : {}),
        }),
      });
      const data = (await res.json()) as { error?: string; detail?: string };
      if (!res.ok) throw new Error(data.detail || data.error || 'Failed to send selected signals');
      await loadReadiness();
      setSelectedSignalIds(new Set());
      setSelectedItemId(null);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Failed to send selected signals');
    } finally {
      setSending(false);
    }
  }

  async function updateSelectedSignalStatus(status: ReadinessStatus) {
    const selectedItems = categoryItems.filter((item) => selectedSignalIds.has(item.id));
    if (selectedItems.length === 0) return;

    setRowActionId('bulk');
    setSendError(null);

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
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Failed to update selected signals');
    } finally {
      setRowActionId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--border-tertiary)' }}>
          <Skeleton className="h-8 w-44 bg-[var(--bg-primary)]" />
        </div>
        <div className="grid gap-5 px-6 py-6 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
          <Skeleton className="h-16 rounded-[8px] bg-[var(--bg-primary)] lg:col-span-2" />
          <Skeleton className="h-[420px] rounded-[8px] bg-[var(--bg-primary)]" />
          <Skeleton className="h-[420px] rounded-[8px] bg-[var(--bg-primary)]" />
        </div>
      </div>
    );
  }

  const signalsReviewed = selectedItem ? metadataNumber(selectedItem, 'signals_reviewed') : 0;
  const evidenceSources = sourceEvidence(selectedItem);

  return (
    <main className="flex h-full flex-col overflow-hidden" aria-labelledby="readiness-heading">
      <div className="px-6 pt-[18px] pb-[10px]">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 id="readiness-heading" className="type-page-title" style={{ color: 'var(--text-primary)' }}>Readiness</h1>
            <p className="type-body mt-[2px]" style={{ color: 'var(--text-tertiary)' }}>
              Detect change, explain impact, identify audience, recommend action, then send or prevent.
            </p>
          </div>
        </div>
      </div>

      {!brief ? (
        <section className="flex flex-col items-center justify-center flex-1 gap-3 py-12" aria-labelledby="readiness-empty-heading">
          <IconRadar size={32} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
          <h2 id="readiness-empty-heading" className="type-section-title" style={{ color: 'var(--text-secondary)' }}>No Readiness Signals</h2>
          <div className="type-body text-center max-w-[280px] leading-[1.5]" style={{ color: 'var(--text-tertiary)' }}>
            Sync Slack knowledge and run readiness analysis to find role-specific updates.
          </div>
        </section>
      ) : (
        <>
          <section
            aria-labelledby="delivery-targets-heading"
            className="px-6 pt-3"
          >
            <Card className="rounded-[8px] px-4 py-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className="size-8 shrink-0 rounded-[7px] flex items-center justify-center"
                    style={{ backgroundColor: 'var(--canon-purple-light)', color: 'var(--canon-purple)' }}
                  >
                    <IconSend size={15} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 id="delivery-targets-heading" className="type-panel-title" style={{ color: 'var(--text-primary)' }}>Delivery targets</h2>
                      <StatusBadge variant="custom" label="All sends" />
                    </div>
                    <div className="type-caption mt-[2px]" style={{ color: 'var(--text-tertiary)' }}>
                      Channel and DM destinations for ready briefs, selected signals, and row sends.
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:justify-end">
                  <Select value={deliveryChannelId} onValueChange={setDeliveryChannelId}>
                    <SelectTrigger className="h-8 w-full lg:w-[210px]">
                      <IconHash size={14} />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto source channel</SelectItem>
                      {channels.map((channel) => (
                        <SelectItem key={channel.id} value={channel.id}>
                          #{channel.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 w-full justify-between lg:w-[170px]">
                        <span className="flex min-w-0 items-center gap-2">
                          <IconUser size={14} />
                          <span className="truncate">{selectedUserLabel(selectedUserIds, slackUsers)}</span>
                        </span>
                        <IconChevronDown size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[240px]">
                      {selectedUserIds.some((target) => target.startsWith('D')) && (
                        <>
                          <DropdownMenuGroup>
                            {selectedUserIds.filter((target) => target.startsWith('D')).map((target) => (
                              <DropdownMenuItem
                                key={target}
                                role="menuitemcheckbox"
                                aria-checked
                                onSelect={(event) => {
                                  event.preventDefault();
                                  toggleUser(target);
                                }}
                              >
                                <span className="flex h-4 w-4 items-center justify-center">
                                  <IconCheck size={13} />
                                </span>
                                <span className="min-w-0 flex-1 truncate">{target}</span>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuGroup>
                          <DropdownMenuSeparator />
                        </>
                      )}
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
                              onSelect={(event) => {
                                event.preventDefault();
                                toggleUser(slackUser.id);
                              }}
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

                  <div className="flex min-w-0 gap-2">
                    <Input
                      value={dmTargetInput}
                      onChange={(event) => setDmTargetInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          addDmTarget();
                        }
                      }}
                      placeholder="DM ID"
                      aria-label="Slack DM channel or user ID"
                      className="h-8 w-full lg:w-[120px]"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={addDmTarget}
                      disabled={!normalizeDmTarget(dmTargetInput)}
                      className="h-8 shrink-0"
                    >
                      Add
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={saveDeliverySettings}
                      disabled={savingDeliverySettings}
                      className="h-8 shrink-0"
                    >
                      {savingDeliverySettings ? 'Saving...' : 'Save Targets'}
                    </Button>
                    <Button
                      onClick={sendReadinessNote}
                      disabled={!brief || unsentCategoryItems.length === 0 || sending}
                      className="h-8 shrink-0"
                    >
                      <IconSend size={14} /> {sending ? 'Sending...' : 'Send Now'}
                    </Button>
                  </div>
                </div>
              </div>
              {(deliverySettingsMessage || sendError) && (
                <div className="mt-3">
                  {deliverySettingsMessage && !sendError && (
                    <div className="type-caption" role="status" aria-live="polite" style={{ color: 'var(--text-tertiary)' }}>{deliverySettingsMessage}</div>
                  )}
                  {sendError && (
                    <Alert variant="destructive">
                      <AlertTitle>Could not send note</AlertTitle>
                      <AlertDescription>{sendError}</AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </Card>
          </section>

          <div className="grid flex-1 min-h-0 gap-5 overflow-y-auto px-6 py-5 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] lg:overflow-hidden">
            <Card className="min-w-0 overflow-hidden flex flex-col rounded-[8px]" aria-labelledby="signals-heading">
              <CardHeader className="border-b px-4 py-3" style={{ borderColor: 'var(--border-tertiary)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 id="signals-heading" className="type-section-title leading-none" style={{ color: 'var(--text-primary)' }}>Signals</h2>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 w-[176px] shrink-0 justify-between">
                        <span className="truncate">{filterLabel}</span>
                        <IconChevronDown size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[210px]">
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          role="menuitemcheckbox"
                          aria-checked={allCategoriesSelected}
                          onSelect={(event) => {
                            event.preventDefault();
                            setActiveCategories(allCategoriesSelected ? [] : categories.map((category) => category.id));
                          }}
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
                            onSelect={(event) => {
                              event.preventDefault();
                              toggleCategory(category.id);
                            }}
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
              </CardHeader>

              <CardContent className="min-h-0 overflow-y-auto p-2">
              <div
                className="sticky top-0 z-10 -mx-2 -mt-2 border-b px-[14px] py-[10px]"
                style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-tertiary)' }}
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

                  {hasSignalSelection ? (
                    <>
                      <div className="min-w-0 flex-1 type-caption font-medium" style={{ color: 'var(--text-secondary)' }}>
                        {selectedSignalCount} selected
                      </div>
                      <TooltipProvider delayDuration={120}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => void sendSelectedSignals()}
                              disabled={selectedUnsentSignalCount === 0 || sending || rowActionId === 'bulk'}
                              aria-label="Send selected signals"
                            >
                              <IconSend size={14} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">Send selected signals</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => void updateSelectedSignalStatus('reviewed')}
                              disabled={rowActionId === 'bulk'}
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
                              disabled={rowActionId === 'bulk'}
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
                              disabled={rowActionId === 'bulk'}
                              aria-label="Archive selected signals"
                              className="text-[var(--red)] hover:text-[var(--red)]"
                            >
                              <IconArchive size={14} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">Archive selected signals</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearSignalSelection}
                        disabled={sending || rowActionId === 'bulk'}
                        className="h-8 px-2"
                      >
                        Clear
                      </Button>
                    </>
                  ) : (
                    <div className="min-w-0 flex-1 type-caption font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Select signals for bulk actions
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-2">
              {categoryItems.length === 0 ? (
                <Alert>
                  <IconRadar size={15} />
                  <AlertTitle>{activeCategories.length === 0 ? 'No categories selected' : 'No active signals'}</AlertTitle>
                  <AlertDescription>
                    {activeCategories.length === 0 ? 'Select at least one category to view readiness signals.' : 'This filter is clear for now.'}
                  </AlertDescription>
                </Alert>
              ) : categoryItems.map((item, index) => {
                const selected = selectedItem?.id === item.id;
                const isLast = index === categoryItems.length - 1;
                return (
                  <div
                    key={item.id}
                    className="flex w-full items-start gap-2 rounded-[7px] transition-colors duration-[120ms]"
                    style={{
                      backgroundColor: selected ? 'var(--bg-secondary)' : 'transparent',
                      borderBottom: isLast ? '0' : '1px solid var(--border-tertiary)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSignalIds.has(item.id)}
                      onChange={() => toggleSignalSelection(item.id)}
                      className="ml-3 mt-[14px] h-4 w-4 flex-shrink-0 accent-[var(--canon-purple)]"
                      aria-label={`Select ${item.title}`}
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedItemId(item.id)}
                      className="min-w-0 flex-1 py-[10px] pr-3 text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="type-panel-title leading-[1.35]" style={{ color: 'var(--text-primary)' }}>{item.title}</div>
                          <div className="type-caption mt-1" style={{ color: 'var(--text-tertiary)' }}>
                            {item.affected_roles.length} role{item.affected_roles.length === 1 ? '' : 's'} · {formatDate(item.sent_at)}
                          </div>
                        </div>
                        <StatusBadge variant={statusBadge[item.status]} label={statusLabels[item.status]} />
                      </div>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="mr-1 mt-[8px] shrink-0"
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
                );
              })}
              </div>
            </CardContent>
            </Card>

            <Card className="min-w-0 overflow-y-auto rounded-[8px]" aria-labelledby="selected-signal-heading">
              <CardHeader className="border-b px-5 py-4" style={{ borderColor: 'var(--border-tertiary)' }}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <StatusBadge
                        variant={selectedItem ? statusBadge[selectedItem.status] : 'pending'}
                        label={selectedItem ? statusLabels[selectedItem.status] : 'No signal'}
                      />
                    </div>
                    <h2 id="selected-signal-heading" className="type-detail-title" style={{ color: 'var(--text-primary)' }}>
                      {selectedItem?.title ?? 'No signal selected'}
                    </h2>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-5 grid gap-5">
              <StepRow icon={IconRadar} label="1. Detect change">
                <p className="type-card-body" style={{ color: 'var(--text-secondary)' }}>
                  {selectedItem?.summary ?? 'Select a readiness signal to review the change.'}
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
                  {audience.length === 0 ? (
                    <span className="type-body" style={{ color: 'var(--text-tertiary)' }}>No affected roles.</span>
                  ) : audience.map((role) => (
                    <span
                      key={role.role}
                      className="type-control-sm rounded-[4px] px-[7px] py-[3px]"
                      style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-tertiary)' }}
                    >
                      {role.role}
                    </span>
                  ))}
                </div>
              </StepRow>

              <StepRow icon={IconArrowRight} label="4. Recommend action" tone="action">
                <p className="type-card-body" style={{ color: 'var(--text-secondary)' }}>{nextAction(selectedItem)}</p>
              </StepRow>

              <StepRow icon={selectedItem?.status === 'sent' ? IconCheck : IconSend} label="5. Send or prevent" divider={false}>
                <p className="type-card-body" style={{ color: 'var(--text-secondary)' }}>
                  {selectedItem?.status === 'sent'
                    ? `Sent ${formatDate(selectedItem.sent_at)}.`
                    : `${unsentCategoryItems.length} update${unsentCategoryItems.length === 1 ? '' : 's'} ready in this filter.`}
                </p>
              </StepRow>
            </CardContent>
            </Card>
          </div>
        </>
      )}
    </main>
  );
}
