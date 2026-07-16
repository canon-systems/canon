'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Archive as IconArchive,
  ArrowRight as IconArrowRight,
  Brain as IconBrain,
  CalendarDays as IconCalendar,
  Check as IconCheck,
  ChevronDown as IconChevronDown,
  Clock as IconClock,
  ExternalLink as IconExternalLink,
  Hash as IconHash,
  MoreVertical as IconDotsVertical,
  Pencil as IconPencil,
  Radar as IconRadar,
  RefreshCw as IconRefresh,
  Send as IconSend,
  ShieldCheck as IconShieldCheck,
  Trash2 as IconTrash,
  Users as IconUsers,
  X as IconX,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/components/ui/utils';
import { IntegrationLogos } from '@/components/IntegrationLogos';
import { SlackUserPicker, type SlackUser } from '@/components/SlackUserPicker';
import type { KnowledgeSource, ReadinessBrief, ReadinessCategory, ReadinessItem, ReadinessStatus } from '@/types/onboarding';

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

type DeliveryProvider = 'slack' | 'teams';
type DeliveryTargetType = 'channel' | 'dm';

type DeliveryTarget = {
  provider: DeliveryProvider;
  targetType: DeliveryTargetType;
  targetId: string;
  targetName: string | null;
  enabled: boolean;
};

type DeliveryTargetOption = DeliveryTarget & {
  label: string;
};

type IntegrationConnection = {
  provider: string;
  status: string;
};

type ReadinessDeleteRequest = {
  items: Array<Pick<ReadinessItem, 'id' | 'title'>>;
};

type ReadinessResponse = {
  brief?: ReadinessBrief | null;
  permissions?: { can_delete_signals?: boolean };
};

type MeetingBriefingsResponse = {
  calendar: {
    connected: boolean;
    lastSyncedAt: string | null;
    providers: Array<{
      provider: 'google_calendar' | 'outlook';
      label: string;
      connected: boolean;
      syncStatus: string;
      lastSyncedAt: string | null;
      error: string | null;
    }>;
  };
  summary: {
    upcoming: number;
    delivered: number;
    needsAttention: number;
  };
  upcoming: Array<{
    id: string;
    provider: 'google_calendar' | 'outlook';
    providerLabel: string;
    title: string;
    startAt: string;
    endAt: string | null;
    meetingUrl: string | null;
    customerDomain: string | null;
    briefingStatus: 'waiting' | 'pending' | 'delivered' | 'skipped' | 'failed';
    recipients: string[];
  }>;
  history: Array<{
    id: string;
    meetingId: string;
    meetingTitle: string;
    meetingStartAt: string;
    recipient: string;
    status: 'pending' | 'delivered' | 'skipped' | 'failed';
    reason: string | null;
    briefText: string | null;
    attempts: number;
    deliveredAt: string | null;
    lastAttemptAt: string | null;
    permalink: string | null;
  }>;
  permissions: { canSync: boolean };
};

const deliveryProviders = ['slack'] as const satisfies readonly DeliveryProvider[];
const digestWeekdays = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

function isDeliveryProvider(provider: string): provider is DeliveryProvider {
  return (deliveryProviders as readonly string[]).includes(provider);
}

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
      const provider = typeof source.provider === 'string' ? source.provider : item.source ?? 'source';
      const channelName = typeof source.channel_name === 'string' ? source.channel_name.replace(/^#/, '') : null;
      const channelId = typeof source.channel_id === 'string' ? source.channel_id : null;
      const messageTs = typeof source.message_ts === 'string' ? source.message_ts : null;
      const sourceName = typeof source.source_name === 'string' ? source.source_name : null;
      const sourceType = typeof source.source_type === 'string' ? source.source_type : null;
      const url = typeof source.url === 'string' ? source.url : channelId ? slackMessageUrl(channelId, messageTs) : null;
      const label = channelName
        ? `#${channelName}`
        : provider === 'granola'
          ? `${sourceType === 'transcript' ? 'Granola transcript' : 'Granola'}${sourceName ? `: ${sourceName}` : ''}`
          : sourceName ?? (item.source === 'slack' ? 'Slack evidence' : item.source ?? 'Source');
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

  if (item.source_url) {
    return [{
      label: item.source === 'granola' ? 'Granola transcript' : item.source ?? 'Source',
      url: item.source_url,
    }];
  }

  if (item.source === 'slack') return [{ label: 'Slack knowledge', url: null }];
  return [{ label: item.source ?? 'Source', url: null }];
}

function formatTimestamp(value: string | null) {
  if (!value) return 'Not sent';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function briefingBadge(status: string): { variant: BadgeVariant; label: string } {
  if (status === 'delivered' || status === 'ready') return { variant: 'delivered', label: status === 'ready' ? 'Synced' : 'Delivered' };
  if (status === 'failed' || status === 'needs_attention') return { variant: 'error', label: 'Needs Attention' };
  if (status === 'skipped') return { variant: 'completed', label: 'No Brief Needed' };
  if (status === 'syncing' || status === 'pending') return { variant: 'pending', label: status === 'syncing' ? 'Refreshing' : 'Preparing' };
  return { variant: 'upcoming', label: 'Waiting' };
}

function briefingReason(reason: string | null) {
  if (!reason) return null;
  if (reason === 'no_related_readiness_context' || reason === 'thin_context' || reason === 'empty_brief') {
    return 'No useful meeting context was found.';
  }
  return 'Canon could not send this briefing.';
}

function preventionText(item: ReadinessItem | null) {
  if (!item) return 'Select an update to see what Canon should help prevent.';
  if (item.category === 'customer_objection') return 'Inconsistent customer answers and late-stage deal hesitation.';
  if (item.category === 'demo_guidance') return 'Stale demos and missed proof points in live calls.';
  if (item.category === 'implementation_pattern') return 'Repeated delivery delays and unclear kickoff ownership.';
  return 'Outdated product context in demos, POCs, and launch conversations.';
}

function nextAction(item: ReadinessItem | null) {
  if (!item) return 'Select an update.';
  if (item.recommended_action) return item.recommended_action;
  if (item.category === 'customer_objection') return 'Send the approved response and assign a technical owner.';
  if (item.category === 'demo_guidance') return 'Send the updated demo note and refresh the talk track.';
  if (item.category === 'implementation_pattern') return 'Send implementation guidance and update the kickoff checklist.';
  return 'Send a role-specific product update and review the affected learning steps.';
}

function selectedCategoryLabel(selectedCategories: ReadinessCategory[]) {
  if (selectedCategories.length === 0) return 'No categories';
  if (selectedCategories.length === categories.length) return 'All categories';
  if (selectedCategories.length === 1) {
    return categories.find((category) => category.id === selectedCategories[0])?.label ?? 'Category';
  }
  return `${selectedCategories.length} categories`;
}

function deliveryTargetKey(target: Pick<DeliveryTarget, 'provider' | 'targetType' | 'targetId'>) {
  return `${target.provider}:${target.targetType}:${target.targetId}`;
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
  const [hasKnowledgeSources, setHasKnowledgeSources] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeCategories, setActiveCategories] = useState<ReadinessCategory[]>(categories.map((category) => category.id));
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedSignalIds, setSelectedSignalIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'signals' | 'delivery' | 'briefings'>('signals');
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [rowActionId, setRowActionId] = useState<string | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<ReadinessDeleteRequest | null>(null);
  const [deletingSignals, setDeletingSignals] = useState(false);
  const [canDeleteSignals, setCanDeleteSignals] = useState(false);
  const [knownDeliveryTargetOptions, setKnownDeliveryTargetOptions] = useState<DeliveryTargetOption[]>([]);
  const [targetOptionsReconnectRequired, setTargetOptionsReconnectRequired] = useState(false);
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [customTargets, setCustomTargets] = useState<DeliveryTarget[]>([]);
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [weeklyDigestEnabled, setWeeklyDigestEnabled] = useState(true);
  const [digestWeekday, setDigestWeekday] = useState(1);
  const [digestHourUtc, setDigestHourUtc] = useState(13);
  const [meetingPrepEnabled, setMeetingPrepEnabled] = useState(true);
  const [meetingPrepMinutesBefore, setMeetingPrepMinutesBefore] = useState(45);
  const [meetingPrepRecipients, setMeetingPrepRecipients] = useState<SlackUser[]>([]);
  const [meetingBriefings, setMeetingBriefings] = useState<MeetingBriefingsResponse | null>(null);
  const [loadingMeetingBriefings, setLoadingMeetingBriefings] = useState(true);
  const [refreshingCalendar, setRefreshingCalendar] = useState(false);
  const [savingDeliverySettings, setSavingDeliverySettings] = useState(false);
  const [selectedDeliveryProvider, setSelectedDeliveryProvider] = useState<DeliveryProvider | null>(null);

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
            const data = (await res.json()) as ReadinessResponse;
            const next = data.brief;
            const newestUpdate = Math.max(
              ...(next?.items ?? []).map((item) => new Date(item.updated_at || item.detected_at || item.created_at).getTime()),
              0
            );
            if (newestUpdate >= requestedAt || attempts >= 20) {
              clearInterval(interval);
              setBrief(next ?? null);
              setCanDeleteSignals(data.permissions?.can_delete_signals === true);
              if (newestUpdate >= requestedAt) {
                toast.success('Readiness updates are ready to review');
              }
              resolve();
            }
          } catch {
            if (attempts >= 20) { clearInterval(interval); resolve(); }
          }
        }, 3000);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not find readiness updates. Please try again.';
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  }

  async function loadReadiness() {
    try {
      const res = await fetch('/api/onboarding/readiness');
      const data = (await res.json()) as ReadinessResponse;
      setBrief(data.brief ?? null);
      setCanDeleteSignals(data.permissions?.can_delete_signals === true);
    } catch {
      setBrief(null);
      setCanDeleteSignals(false);
    } finally {
      setLoading(false);
    }
  }

  async function loadMeetingBriefings() {
    try {
      const response = await fetch('/api/onboarding/readiness/meeting-prep');
      const data = (await response.json()) as MeetingBriefingsResponse & { error?: string; detail?: string };
      if (!response.ok) throw new Error(data.detail || data.error || 'Failed to load meeting briefings');
      setMeetingBriefings(data);
      return data;
    } catch {
      setMeetingBriefings(null);
      return null;
    } finally {
      setLoadingMeetingBriefings(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [readinessRes, knowledgeRes] = await Promise.all([
          fetch('/api/onboarding/readiness'),
          fetch('/api/onboarding/knowledge'),
        ]);
        const data = (await readinessRes.json()) as ReadinessResponse;
        const knowledgeData = (await knowledgeRes.json()) as { sources?: KnowledgeSource[] };
        if (!cancelled) setBrief(data.brief ?? null);
        if (!cancelled) setCanDeleteSignals(data.permissions?.can_delete_signals === true);
        if (!cancelled) setHasKnowledgeSources((knowledgeData.sources ?? []).length > 0);
      } catch {
        if (!cancelled) setBrief(null);
        if (!cancelled) setCanDeleteSignals(false);
        if (!cancelled) setHasKnowledgeSources(false);
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
    void loadMeetingBriefings();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDeliveryOptions() {
      const [settingsResult, integrationsResult] = await Promise.allSettled([
        fetch('/api/onboarding/readiness/delivery-settings').then((res) => res.json() as Promise<{
          settings?: {
            channelIds?: string[];
            userIds?: string[];
            targets?: Array<{
              provider: DeliveryProvider;
              targetType: DeliveryTargetType;
              targetId: string;
              targetName: string | null;
              enabled: boolean;
            }>;
            weeklyDigestEnabled?: boolean;
            digestWeekday?: number;
            digestHourUtc?: number;
            meetingPrepEnabled?: boolean;
            meetingPrepMinutesBefore?: number;
          } | null;
        }>),
        fetch('/api/integrations/list').then((res) => res.json() as Promise<{ connections?: IntegrationConnection[] }>),
      ]);

      if (cancelled) return;

      const nextConnections = integrationsResult.status === 'fulfilled' ? integrationsResult.value.connections ?? [] : [];
      const activeProviders = new Set(nextConnections
        .filter((connection) => connection.status === 'active' && isDeliveryProvider(connection.provider))
        .map((connection) => connection.provider as DeliveryProvider));
      let nextChannelIds: string[] = [];
      let nextCustomTargets: DeliveryTarget[] = [];
      let nextMeetingPrepRecipients: SlackUser[] = [];

      if (settingsResult.status === 'fulfilled' && settingsResult.value.settings) {
        nextChannelIds = settingsResult.value.settings.channelIds ?? [];
        const savedTargets = settingsResult.value.settings.targets ?? [];
        nextCustomTargets = savedTargets
          .filter((target) => target.provider !== 'slack' && target.enabled)
          .map((target) => ({
            provider: target.provider,
            targetType: target.targetType,
            targetId: target.targetId,
            targetName: target.targetName,
            enabled: true,
          }));
        const savedDmTargets = savedTargets.filter((target) => (
          target.provider === 'slack' && target.targetType === 'dm' && target.enabled
        ));
        const savedUserIds = savedDmTargets.length > 0
          ? savedDmTargets.map((target) => target.targetId)
          : settingsResult.value.settings.userIds ?? [];
        nextMeetingPrepRecipients = savedUserIds.map((userId) => {
          const target = savedDmTargets.find((savedTarget) => savedTarget.targetId === userId);
          return { id: userId, name: target?.targetName ?? userId, email: null };
        });
        setSelectedChannelIds(nextChannelIds);
        setCustomTargets(nextCustomTargets);
        setMeetingPrepRecipients(nextMeetingPrepRecipients);
        setWeeklyDigestEnabled(settingsResult.value.settings.weeklyDigestEnabled !== false);
        setDigestWeekday(typeof settingsResult.value.settings.digestWeekday === 'number' ? settingsResult.value.settings.digestWeekday : 1);
        setDigestHourUtc(typeof settingsResult.value.settings.digestHourUtc === 'number' ? settingsResult.value.settings.digestHourUtc : 13);
        setMeetingPrepEnabled(settingsResult.value.settings.meetingPrepEnabled !== false);
        setMeetingPrepMinutesBefore(typeof settingsResult.value.settings.meetingPrepMinutesBefore === 'number' ? settingsResult.value.settings.meetingPrepMinutesBefore : 45);
      }

      setConnections(nextConnections);

      const savedProvider = nextChannelIds.length > 0
        ? 'slack'
        : nextCustomTargets.find((target) => target.targetType === 'channel')?.provider ?? null;
      const activeProvider = savedProvider && activeProviders.has(savedProvider)
        ? savedProvider
        : deliveryProviders.find((provider) => activeProviders.has(provider)) ?? savedProvider;

      setSelectedDeliveryProvider(activeProvider ?? null);
    }

    void loadDeliveryOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadProviderTargets() {
      if (!selectedDeliveryProvider) {
        setKnownDeliveryTargetOptions([]);
        setTargetOptionsReconnectRequired(false);
        return;
      }

      setKnownDeliveryTargetOptions([]);
      setTargetOptionsReconnectRequired(false);

      const targetOptionsResult = await fetch(`/api/onboarding/readiness/delivery-target-options?provider=${selectedDeliveryProvider}`)
        .then((res) => res.json() as Promise<{
          targets?: DeliveryTargetOption[];
          reconnectRequired?: boolean;
        }>)
        .catch(() => ({ targets: [], reconnectRequired: false }));

      if (cancelled) return;

      setKnownDeliveryTargetOptions(targetOptionsResult.targets ?? []);
      setTargetOptionsReconnectRequired(Boolean(targetOptionsResult.reconnectRequired));
    }

    void loadProviderTargets();

    return () => {
      cancelled = true;
    };
  }, [selectedDeliveryProvider]);

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
  const connectedDeliveryProviders = useMemo(() => new Set(
    connections
      .filter((connection) => connection.status === 'active' && isDeliveryProvider(connection.provider))
      .map((connection) => connection.provider as DeliveryProvider)
  ), [connections]);
  const savedDeliveryProvider = useMemo<DeliveryProvider | null>(() => {
    if (selectedChannelIds.length > 0) return 'slack';
    return customTargets.find((target) => target.targetType === 'channel')?.provider ?? null;
  }, [customTargets, selectedChannelIds]);
  const activeDeliveryProvider = useMemo<DeliveryProvider | null>(() => {
    if (selectedDeliveryProvider) return selectedDeliveryProvider;
    if (savedDeliveryProvider && connectedDeliveryProviders.has(savedDeliveryProvider)) return savedDeliveryProvider;
    return deliveryProviders.find((provider) => connectedDeliveryProviders.has(provider)) ?? savedDeliveryProvider;
  }, [connectedDeliveryProviders, savedDeliveryProvider, selectedDeliveryProvider]);
  const activeProviderConnected = activeDeliveryProvider ? connectedDeliveryProviders.has(activeDeliveryProvider) : false;
  const activeCustomTargets = useMemo(
    () => activeDeliveryProvider ? customTargets.filter((target) => target.provider === activeDeliveryProvider) : [],
    [activeDeliveryProvider, customTargets]
  );
  const deliveryTargets = useMemo<DeliveryTarget[]>(() => {
    if (activeDeliveryProvider === 'slack') {
      return selectedChannelIds.map((channelId) => ({
        provider: 'slack' as const,
        targetType: 'channel' as const,
        targetId: channelId,
        targetName: knownDeliveryTargetOptions.find((target) => target.provider === 'slack' && target.targetId === channelId)?.targetName ?? null,
        enabled: true,
      }));
    }
    return activeCustomTargets.filter((target) => target.targetType === 'channel');
  }, [activeCustomTargets, activeDeliveryProvider, knownDeliveryTargetOptions, selectedChannelIds]);
  const meetingPrepTargets = useMemo<DeliveryTarget[]>(() => meetingPrepRecipients.map((recipient) => ({
    provider: 'slack',
    targetType: 'dm',
    targetId: recipient.id,
    targetName: recipient.name,
    enabled: true,
  })), [meetingPrepRecipients]);
  const savedDeliveryTargets = useMemo(
    () => [...deliveryTargets, ...meetingPrepTargets],
    [deliveryTargets, meetingPrepTargets]
  );
  const visibleDeliveryTargetOptions = useMemo(
    () => knownDeliveryTargetOptions.filter((target) => target.targetType === 'channel'),
    [knownDeliveryTargetOptions]
  );
  const hasDeliveryTargets = deliveryTargets.length > 0;
  const deliverySettingsReady = (!weeklyDigestEnabled || hasDeliveryTargets)
    && (!meetingPrepEnabled || meetingPrepRecipients.length > 0);
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
  const digestWeekdayLabel = digestWeekdays.find((weekday) => weekday.value === digestWeekday)?.label ?? 'Monday';
  const providerSummaryLabel = activeDeliveryProvider ? providerLabel(activeDeliveryProvider) : 'No Provider';
  const deliverySummaryLabel = hasDeliveryTargets
    ? `${deliveryTargets.length} ${deliveryTargets.length === 1 ? 'Target' : 'Targets'}`
    : 'No Targets';
  const weeklyDigestSummary = weeklyDigestEnabled
    ? `${digestWeekdayLabel}, ${digestHourUtc}:00 UTC`
    : 'Off';
  const meetingPrepSummary = meetingPrepEnabled
    ? `${meetingPrepMinutesBefore} Min · ${meetingPrepRecipients.length} ${meetingPrepRecipients.length === 1 ? 'Recipient' : 'Recipients'}`
    : 'Off';
  const weeklyDigestStatus = weeklyDigestEnabled ? 'On' : 'Off';
  const meetingPrepStatus = meetingPrepEnabled ? 'On' : 'Off';

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
    toast.error('Choose where to send updates', { description: 'Pick at least one delivery target before sending.' });
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
          channelIds: activeDeliveryProvider === 'slack' ? selectedChannelIds : [],
          userIds: [],
          targets: deliveryTargets,
        }),
      });
      const data = (await res.json()) as { error?: string; detail?: string };
      if (!res.ok) throw new Error(data.detail || data.error || 'Failed to send readiness update');
      await loadReadiness();
      setSelectedItemId(item.id);
      toast.success('Signal sent');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send readiness update');
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
      if (!res.ok) throw new Error(data.detail || data.error || 'Failed to update readiness item');
      await loadReadiness();
      setSelectedItemId(status === 'archived' ? null : item.id);
      const label = status === 'archived' ? 'Signal archived' : status === 'reviewed' ? 'Marked as reviewed' : 'Status updated';
      toast.success(label);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update readiness item');
    } finally {
      setRowActionId(null);
    }
  }

  function requestSignalDelete(item: ReadinessItem) {
    setDeleteRequest({ items: [{ id: item.id, title: item.title }] });
  }

  function requestSelectedSignalDelete() {
    const selectedItems = categoryItems
      .filter((item) => selectedSignalIds.has(item.id))
      .map(({ id, title }) => ({ id, title }));
    if (selectedItems.length > 0) setDeleteRequest({ items: selectedItems });
  }

  async function confirmSignalDelete() {
    if (!deleteRequest || deleteRequest.items.length === 0) return;
    const itemIds = deleteRequest.items.map((item) => item.id);
    const deletedIdSet = new Set(itemIds);
    setDeletingSignals(true);
    setRowActionId(itemIds.length === 1 ? itemIds[0] : 'bulk');
    try {
      const res = await fetch('/api/onboarding/readiness', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds }),
      });
      const data = (await res.json()) as { error?: string; detail?: string; count?: number };
      if (!res.ok) throw new Error(data.detail || data.error || 'Failed to delete readiness signal');

      setSelectedSignalIds((current) => new Set(Array.from(current).filter((id) => !deletedIdSet.has(id))));
      setSelectedItemId((current) => current && deletedIdSet.has(current) ? null : current);
      setDeleteRequest(null);
      await loadReadiness();
      const count = data.count ?? itemIds.length;
      toast.success(count === 1 ? 'Readiness signal deleted' : `${count} readiness signals deleted`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete readiness signal');
    } finally {
      setDeletingSignals(false);
      setRowActionId(null);
    }
  }

  async function saveDeliverySettings() {
    setSavingDeliverySettings(true);
    try {
      const slackDeliveryActive = activeDeliveryProvider === 'slack';
      const channelIds = slackDeliveryActive ? selectedChannelIds : [];
      const channelNames = channelIds
        .map((id) => knownDeliveryTargetOptions.find((target) => target.provider === 'slack' && target.targetId === id)?.targetName ?? '')
        .filter(Boolean);
      const res = await fetch('/api/onboarding/readiness/delivery-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelIds,
          channelNames,
          userIds: meetingPrepRecipients.map((recipient) => recipient.id),
          targets: savedDeliveryTargets,
          weeklyDigestEnabled,
          digestWeekday,
          digestHourUtc,
          meetingPrepEnabled,
          meetingPrepMinutesBefore,
        }),
      });
      const data = (await res.json()) as { error?: string; detail?: string };
      if (!res.ok) throw new Error(data.detail || data.error || 'Failed to save delivery settings');
      await loadMeetingBriefings();
      toast.success('Delivery settings saved');
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

  function providerLabel(provider: DeliveryProvider) {
    if (provider === 'teams') return 'Microsoft Teams';
    return 'Slack';
  }

  function targetDisplayName(target: DeliveryTarget) {
    if (target.targetName) return target.provider === 'slack' && target.targetType === 'channel'
      ? `#${target.targetName}`
      : target.targetName;
    return target.targetId;
  }

  function selectedTargetSummary(provider: DeliveryProvider | null) {
    if (deliveryTargets.length === 0) return 'No Destination Selected';
    if (deliveryTargets.length === 1) return targetDisplayName(deliveryTargets[0]);
    void provider;
    return `${deliveryTargets.length} Channels Selected`;
  }

  function targetPickerEmptyLabel(provider: DeliveryProvider | null) {
    if (provider === 'teams') return 'No Teams Channels Found';
    return 'No Slack Channels Found';
  }

  function selectDeliveryProvider(provider: DeliveryProvider) {
    setSelectedDeliveryProvider(provider);
  }

  function toggleDeliveryTarget(target: DeliveryTarget) {
    if (!activeDeliveryProvider) return;
    if (target.targetType !== 'channel') return;
    const targetId = target.targetId.trim();
    if (!targetId) {
      toast.error('Choose a delivery target before saving');
      return;
    }

    const nextTarget: DeliveryTarget = { ...target, targetId };
    const selected = deliveryTargets.some((selectedTarget) => deliveryTargetKey(selectedTarget) === deliveryTargetKey(nextTarget));
    if (selected) {
      removeDeliveryTarget(nextTarget);
      return;
    }

    if (nextTarget.provider === 'slack') {
      setSelectedChannelIds((current) => current.includes(nextTarget.targetId) ? current : [...current, nextTarget.targetId]);
      return;
    }

    setCustomTargets((current) => {
      const exists = current.some((target) => (
        target.provider === nextTarget.provider &&
        target.targetType === nextTarget.targetType &&
        target.targetId === nextTarget.targetId
      ));
      return exists ? current : [...current, nextTarget];
    });
  }

  function removeDeliveryTarget(targetToRemove: DeliveryTarget) {
    if (targetToRemove.provider === 'slack') {
      setSelectedChannelIds((current) => current.filter((id) => id !== targetToRemove.targetId));
      return;
    }

    setCustomTargets((current) => current.filter((target) => !(
      target.provider === targetToRemove.provider &&
      target.targetType === targetToRemove.targetType &&
      target.targetId === targetToRemove.targetId
    )));
  }

  function addMeetingPrepRecipient(recipient: SlackUser | null) {
    if (!recipient) return;
    setMeetingPrepRecipients((current) => (
      current.some((savedRecipient) => savedRecipient.id === recipient.id)
        ? current
        : [...current, recipient]
    ));
  }

  function removeMeetingPrepRecipient(recipientId: string) {
    setMeetingPrepRecipients((current) => current.filter((recipient) => recipient.id !== recipientId));
  }

  async function refreshCalendar() {
    setRefreshingCalendar(true);
    try {
      const response = await fetch('/api/onboarding/readiness/meeting-prep', { method: 'POST' });
      const data = (await response.json().catch(() => ({}))) as { error?: string; detail?: string };
      if (!response.ok) throw new Error(data.detail || data.error || 'Canon could not refresh the calendar.');

      setMeetingBriefings((current) => current ? {
        ...current,
        calendar: {
          ...current.calendar,
          providers: current.calendar.providers.map((provider) => ({ ...provider, syncStatus: 'syncing' })),
        },
      } : current);
      toast.success('Calendar refresh started');
      await new Promise((resolve) => window.setTimeout(resolve, 3000));
      await loadMeetingBriefings();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Canon could not refresh the calendar.');
    } finally {
      setRefreshingCalendar(false);
    }
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
          channelIds: activeDeliveryProvider === 'slack' ? selectedChannelIds : [],
          userIds: [],
          targets: deliveryTargets,
        }),
      });
      const data = (await res.json()) as { error?: string; detail?: string };
      if (!res.ok) throw new Error(data.detail || data.error || 'Failed to send selected updates');
      await loadReadiness();
      setSelectedSignalIds(new Set());
      setSelectedItemId(null);
      toast.success(itemIds.length === 1 ? 'Update sent' : `${itemIds.length} updates sent`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send selected updates');
    } finally {
      setSending(false);
    }
  }

  async function updateSelectedSignalStatus(status: ReadinessStatus) {
    const selectedItems = categoryItems.filter((item) => selectedSignalIds.has(item.id));
    if (selectedItems.length === 0) return;
    const itemIds = selectedItems.map((item) => item.id);

    setRowActionId('bulk');
    try {
      const res = await fetch('/api/onboarding/readiness', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds, status }),
      });
      const data = (await res.json()) as { error?: string; detail?: string };
      if (!res.ok) throw new Error(data.detail || data.error || 'Failed to update selected items');

      await loadReadiness();
      setSelectedSignalIds(new Set());
      if (status === 'archived') setSelectedItemId(null);
      const count = selectedItems.length;
      const label = status === 'archived'
        ? `${count} update${count !== 1 ? 's' : ''} archived`
        : `${count} update${count !== 1 ? 's' : ''} updated`;
      toast.success(label);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update selected items');
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
      <div className="app-page-header flex items-center border-b">
        <div>
          <h1 className="type-page-title" style={{ color: 'var(--text-primary)' }}>Readiness</h1>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* Left sidebar — signal list + delivery settings */}
        <div className={cn(
          'split-sidebar flex-shrink-0 border-r flex flex-col overflow-hidden',
          activeTab === 'signals' ? 'w-[340px]' : 'w-[280px]'
        )}>
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as 'signals' | 'delivery' | 'briefings')}
            className="flex flex-col flex-1 min-h-0"
          >
            <div
              className="split-header flex items-center border-b shrink-0"
              style={{ borderColor: 'var(--border-tertiary)' }}
            >
              <TabsList className="split-tabbar border-b-0 px-3">
                <TabsTrigger value="signals">
                  Updates
                  <span className="ml-1.5 type-caption opacity-60">{items.length}</span>
                </TabsTrigger>
                <TabsTrigger value="delivery">Delivery</TabsTrigger>
                <TabsTrigger value="briefings">Briefings</TabsTrigger>
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
                    aria-label={allSignalsSelected ? 'Clear update selection' : 'Select all updates'}
                    aria-checked={hasSignalSelection && !allSignalsSelected ? 'mixed' : allSignalsSelected}
                  />
                  <div className="min-w-0 flex-1 type-caption font-medium" style={{ color: 'var(--text-secondary)' }}>
                    {hasSignalSelection ? `${selectedSignalCount} selected` : ''}
                  </div>
                  {hasSignalSelection ? (
                    <TooltipProvider delayDuration={120}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void sendSelectedSignals()}
                            disabled={selectedUnsentSignalCount === 0 || sending || rowActionId === 'bulk'}
                            aria-label="Send selected updates"
                          >
                            <IconSend size={14} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          {!hasDeliveryTargets ? 'Choose where to send updates first' : 'Send selected updates'}
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void updateSelectedSignalStatus('reviewed')}
                            disabled={rowActionId === 'bulk'}
                            aria-label="Mark selected ready to send"
                          >
                            <IconPencil size={14} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Mark selected ready to send</TooltipContent>
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
                            aria-label="Archive selected updates"
                          >
                            <IconArchive size={14} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Archive selected updates</TooltipContent>
                      </Tooltip>
                      {canDeleteSignals && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={requestSelectedSignalDelete}
                              disabled={rowActionId === 'bulk'}
                              aria-label="Delete selected readiness signals"
                              className="text-[var(--red-text)] hover:text-[var(--red-text)]"
                            >
                              <IconTrash size={14} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">Delete selected signals</TooltipContent>
                        </Tooltip>
                      )}
                    </TooltipProvider>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0"
                      onClick={generateSignals}
                      disabled={generating}
                    >
                      <IconBrain size={13} />
                      {generating ? 'Checking...' : 'Find Updates'}
                    </Button>
                  )}
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
                    Choose where Canon should send updates before sending.
                  </button>
                </div>
              )}

              {/* Signal list */}
              <div className="flex-1 overflow-y-auto">
                {categoryItems.length === 0 ? (
                  <div className="p-3">
                    <Alert>
                      <IconRadar size={15} />
                      <AlertTitle>{activeCategories.length === 0 ? 'No Categories Selected' : 'No Active Updates'}</AlertTitle>
                      <AlertDescription>
                        {activeCategories.length === 0 ? 'Select at least one category to view updates.' : 'This filter is clear for now.'}
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
                          {item.affected_roles.length} role{item.affected_roles.length === 1 ? '' : 's'} · {formatTimestamp(item.sent_at)}
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
                              Send this update
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
                          {canDeleteSignals && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() => requestSignalDelete(item)}
                                disabled={rowActionId === item.id || rowActionId === 'bulk'}
                                className="text-[var(--red-text)] focus:text-[var(--red-text)]"
                              >
                                <IconTrash size={14} />
                                Delete permanently
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="delivery" className="m-0 flex-1 p-3">
              <div className="rounded-[8px] border border-[var(--border-tertiary)] bg-[var(--bg-secondary)]">
                {[
                  { label: 'Provider', value: providerSummaryLabel },
                  { label: 'Destination', value: deliverySummaryLabel },
                  { label: 'Weekly Digest', value: weeklyDigestSummary },
                  { label: 'Meeting Prep', value: meetingPrepSummary },
                ].map((item, index) => (
                  <div
                    key={item.label}
                    className={cn(
                      'flex items-center justify-between gap-3 px-3 py-2',
                      index > 0 && 'border-t border-[var(--border-tertiary)]'
                    )}
                  >
                    <div className="type-caption text-[var(--text-tertiary)]">{item.label}</div>
                    <div className="min-w-0 truncate text-right type-caption font-medium text-[var(--text-primary)]">{item.value}</div>
                  </div>
                ))}
              </div>
              {!activeDeliveryProvider && (
                <Alert className="mt-2">
                  <IconSend size={15} />
                  <AlertTitle>No Chat Tool Connected</AlertTitle>
                  <AlertDescription>Connect Slack in Settings.</AlertDescription>
                </Alert>
              )}
            </TabsContent>

            <TabsContent value="briefings" className="m-0 flex-1 p-3">
              {loadingMeetingBriefings ? (
                <div className="space-y-2">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : !meetingBriefings?.calendar.connected ? (
                <Alert>
                  <IconCalendar size={15} />
                  <AlertTitle>Calendar Not Connected</AlertTitle>
                  <AlertDescription>Connect Google Calendar or Outlook in Settings.</AlertDescription>
                </Alert>
              ) : (
                <div className="rounded-[8px] border border-[var(--border-tertiary)] bg-[var(--bg-secondary)]">
                  {[
                    { label: 'Calendar', value: meetingBriefings.calendar.lastSyncedAt ? formatTimestamp(meetingBriefings.calendar.lastSyncedAt) : 'Waiting For First Refresh' },
                    { label: 'Upcoming', value: String(meetingBriefings.summary.upcoming) },
                    { label: 'Delivered', value: String(meetingBriefings.summary.delivered) },
                    { label: 'Needs Attention', value: String(meetingBriefings.summary.needsAttention) },
                  ].map((item, index) => (
                    <div
                      key={item.label}
                      className={cn(
                        'flex items-center justify-between gap-3 px-3 py-2',
                        index > 0 && 'border-t border-[var(--border-tertiary)]'
                      )}
                    >
                      <div className="type-caption text-[var(--text-tertiary)]">{item.label}</div>
                      <div className="min-w-0 truncate text-right type-caption font-medium text-[var(--text-primary)]">{item.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Right panel — signal detail */}
        <div className="surface-page flex-1 min-w-0 flex flex-col overflow-hidden">
          {activeTab === 'briefings' ? (
            <>
              <div className="detail-page-header border-b px-7 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <StatusBadge
                      variant={meetingBriefings?.calendar.connected ? 'delivered' : 'pending'}
                      label={meetingBriefings?.calendar.connected ? 'Calendar Connected' : 'Calendar Needed'}
                    />
                    <h2 className="type-section-title text-[var(--text-primary)]">Meeting Briefings</h2>
                  </div>
                  {meetingBriefings?.permissions.canSync && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void refreshCalendar()}
                      disabled={refreshingCalendar || !meetingBriefings.calendar.connected}
                    >
                      <IconRefresh size={14} className={refreshingCalendar ? 'animate-spin' : undefined} />
                      {refreshingCalendar ? 'Refreshing...' : 'Refresh Calendar'}
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {loadingMeetingBriefings ? (
                  <div className="space-y-3 px-7 py-5">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-40 w-full" />
                  </div>
                ) : !meetingBriefings ? (
                  <div className="px-7 py-5">
                    <Alert>
                      <IconCalendar size={15} />
                      <AlertTitle>Briefings Unavailable</AlertTitle>
                      <AlertDescription>Canon could not load meeting briefings. Refresh the page to try again.</AlertDescription>
                    </Alert>
                  </div>
                ) : (
                  <>
                    <div className="grid border-b border-[var(--border-tertiary)] sm:grid-cols-3">
                      {[
                        { label: 'Upcoming Meetings', value: meetingBriefings.summary.upcoming },
                        { label: 'Briefings Delivered', value: meetingBriefings.summary.delivered },
                        { label: 'Needs Attention', value: meetingBriefings.summary.needsAttention },
                      ].map((item, index) => (
                        <div
                          key={item.label}
                          className={cn(
                            'px-7 py-4',
                            index > 0 && 'border-t border-[var(--border-tertiary)] sm:border-l sm:border-t-0'
                          )}
                        >
                          <div className="type-detail-title tabular-nums text-[var(--text-primary)]">{item.value}</div>
                          <div className="mt-1 type-caption text-[var(--text-tertiary)]">{item.label}</div>
                        </div>
                      ))}
                    </div>

                    <section className="border-b border-[var(--border-tertiary)] px-7 py-5" aria-labelledby="calendar-health-heading">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h3 id="calendar-health-heading" className="type-panel-title text-[var(--text-primary)]">Calendar</h3>
                        <span className="type-caption text-[var(--text-tertiary)]">
                          {meetingBriefings.calendar.lastSyncedAt
                            ? `Last refreshed ${formatTimestamp(meetingBriefings.calendar.lastSyncedAt)}`
                            : 'Waiting for first refresh'}
                        </span>
                      </div>
                      {meetingBriefings.calendar.providers.length === 0 ? (
                        <Alert>
                          <IconCalendar size={15} />
                          <AlertTitle>Calendar Not Connected</AlertTitle>
                          <AlertDescription>Connect Google Calendar or Outlook in Settings.</AlertDescription>
                        </Alert>
                      ) : (
                        <div className="divide-y divide-[var(--border-tertiary)] border-y border-[var(--border-tertiary)]">
                          {meetingBriefings.calendar.providers.map((provider) => {
                            const status = briefingBadge(provider.syncStatus);
                            return (
                              <div key={provider.provider} className="flex flex-wrap items-center gap-3 py-3">
                                <IntegrationLogos provider={provider.provider} size={18} />
                                <div className="min-w-0 flex-1">
                                  <div className="type-body-strong text-[var(--text-primary)]">{provider.label}</div>
                                  <div className="type-caption text-[var(--text-tertiary)]">
                                    {provider.error
                                      ? 'Reconnect or refresh this calendar.'
                                      : provider.lastSyncedAt
                                        ? `Refreshed ${formatTimestamp(provider.lastSyncedAt)}`
                                        : 'Waiting for first refresh'}
                                  </div>
                                </div>
                                <StatusBadge variant={status.variant} label={status.label} />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>

                    <section className="border-b border-[var(--border-tertiary)] px-7 py-5" aria-labelledby="upcoming-briefings-heading">
                      <h3 id="upcoming-briefings-heading" className="mb-3 type-panel-title text-[var(--text-primary)]">Upcoming</h3>
                      {meetingBriefings.upcoming.length === 0 ? (
                        <div className="type-body text-[var(--text-tertiary)]">No meetings are scheduled in the next 14 days.</div>
                      ) : (
                        <div className="divide-y divide-[var(--border-tertiary)] border-y border-[var(--border-tertiary)]">
                          {meetingBriefings.upcoming.map((meeting) => {
                            const status = briefingBadge(meeting.briefingStatus);
                            return (
                              <div key={meeting.id} className="flex flex-wrap items-center gap-3 py-3">
                                <div className="w-[118px] shrink-0">
                                  <div className="type-body-strong text-[var(--text-primary)]">{formatTimestamp(meeting.startAt)}</div>
                                  <div className="type-caption text-[var(--text-tertiary)]">{meeting.providerLabel}</div>
                                </div>
                                <div className="min-w-[180px] flex-1">
                                  <div className="truncate type-body-strong text-[var(--text-primary)]">{meeting.title}</div>
                                  <div className="truncate type-caption text-[var(--text-tertiary)]">
                                    {meeting.recipients.length > 0 ? meeting.recipients.join(', ') : `${meetingPrepRecipients.length} selected recipient${meetingPrepRecipients.length === 1 ? '' : 's'}`}
                                  </div>
                                </div>
                                <StatusBadge variant={status.variant} label={status.label} />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>

                    <section className="px-7 py-5" aria-labelledby="recent-briefings-heading">
                      <h3 id="recent-briefings-heading" className="mb-3 type-panel-title text-[var(--text-primary)]">Recent Briefings</h3>
                      {meetingBriefings.history.length === 0 ? (
                        <div className="type-body text-[var(--text-tertiary)]">No meeting briefings have been prepared yet.</div>
                      ) : (
                        <div className="divide-y divide-[var(--border-tertiary)] border-y border-[var(--border-tertiary)]">
                          {meetingBriefings.history.map((briefing) => {
                            const status = briefingBadge(briefing.status);
                            const reason = briefingReason(briefing.reason);
                            return (
                              <details key={briefing.id} className="group py-3">
                                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3">
                                  <div className="min-w-[180px] flex-1">
                                    <div className="truncate type-body-strong text-[var(--text-primary)]">{briefing.meetingTitle}</div>
                                    <div className="type-caption text-[var(--text-tertiary)]">
                                      {briefing.recipient} · {formatTimestamp(briefing.deliveredAt ?? briefing.lastAttemptAt)}
                                    </div>
                                  </div>
                                  <StatusBadge variant={status.variant} label={status.label} />
                                  <IconChevronDown size={14} className="text-[var(--text-tertiary)] transition-transform group-open:rotate-180" />
                                </summary>
                                <div className="mt-3 max-w-[760px] border-l-2 border-[var(--border-secondary)] pl-3 type-body text-[var(--text-secondary)]">
                                  {briefing.briefText ? (
                                    <div className="whitespace-pre-wrap">{briefing.briefText.replaceAll('*', '')}</div>
                                  ) : (
                                    <div>{reason ?? 'No briefing content was needed.'}</div>
                                  )}
                                  <div className="mt-2 type-caption text-[var(--text-tertiary)]">
                                    {briefing.attempts} {briefing.attempts === 1 ? 'attempt' : 'attempts'}
                                    {briefing.permalink && (
                                      <a href={briefing.permalink} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                                        Open in Slack <IconExternalLink size={11} />
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </details>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  </>
                )}
              </div>
            </>
          ) : activeTab === 'delivery' ? (
            <>
              <div className="detail-page-header border-b px-7 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <StatusBadge variant={deliverySettingsReady ? 'delivered' : 'pending'} label={deliverySettingsReady ? 'Ready' : 'Needs Setup'} />
                    <div className="min-w-0">
                      <h2 className="type-section-title text-[var(--text-primary)]">Delivery Settings</h2>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-7 py-5">
                <section
                  className="max-w-[980px] rounded-[8px] border border-[var(--border-tertiary)] bg-[var(--bg-secondary)]"
                  aria-labelledby="delivery-plan-heading"
                >
                  <h3 id="delivery-plan-heading" className="sr-only">Delivery Settings</h3>

                  <div className="grid gap-3 border-b border-[var(--border-tertiary)] px-4 py-3 lg:grid-cols-[150px_minmax(0,1fr)]">
                    <div>
                      <div className="type-caption font-medium text-[var(--text-primary)]">Provider</div>
                    </div>
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Delivery Provider">
                      {deliveryProviders.map((provider) => {
                        const connected = connectedDeliveryProviders.has(provider);
                        const selected = activeDeliveryProvider === provider;
                        return (
                          <button
                            key={provider}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            disabled={!connected}
                            onClick={() => selectDeliveryProvider(provider)}
                            className="flex h-9 items-center gap-2 rounded-[7px] border px-2.5 type-caption font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                            style={{
                              borderColor: selected ? 'var(--canon-purple)' : 'var(--border-tertiary)',
                              backgroundColor: selected ? 'var(--canon-purple-selected)' : 'var(--bg-primary)',
                              color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
                            }}
                          >
                            <IntegrationLogos provider={provider} size={15} />
                            <span>{providerLabel(provider)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-3 border-b border-[var(--border-tertiary)] px-4 py-3 lg:grid-cols-[150px_minmax(0,1fr)]">
                    <div>
                      <div className="type-caption font-medium text-[var(--text-primary)]">Destination</div>
                    </div>
                    <div className="min-w-0 space-y-2">
                      {!activeDeliveryProvider ? (
                        <Alert className="py-2">
                          <IconSend size={14} />
                          <AlertTitle>No Chat Tool Connected</AlertTitle>
                          <AlertDescription>Connect Slack in Settings.</AlertDescription>
                        </Alert>
                      ) : !activeProviderConnected ? (
                        <Alert className="py-2">
                          <IconSend size={14} />
                          <AlertTitle>Reconnect {providerLabel(activeDeliveryProvider)}</AlertTitle>
                          <AlertDescription>This delivery provider is saved, but it is not connected right now.</AlertDescription>
                        </Alert>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="h-8 w-full justify-between sm:w-[320px]">
                                  <span className="flex min-w-0 items-center gap-2">
                                    <IconHash size={14} />
                                    <span className={cn(
                                      'truncate',
                                      deliveryTargets.length === 0 && 'text-[var(--text-tertiary)]'
                                    )}>
                                      {selectedTargetSummary(activeDeliveryProvider)}
                                    </span>
                                  </span>
                                  <span className="flex shrink-0 items-center gap-2">
                                    {deliveryTargets.length > 0 && (
                                      <span className="rounded-full bg-[var(--bg-secondary)] px-1.5 py-[1px] type-caption text-[var(--text-tertiary)]">
                                        {deliveryTargets.length}
                                      </span>
                                    )}
                                    <IconChevronDown size={14} />
                                  </span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-[320px]">
                                {targetOptionsReconnectRequired ? (
                                  <DropdownMenuItem disabled>Reconnect {providerLabel(activeDeliveryProvider)} To Load Destinations</DropdownMenuItem>
                                ) : visibleDeliveryTargetOptions.length === 0 ? (
                                  <DropdownMenuItem disabled>{targetPickerEmptyLabel(activeDeliveryProvider)}</DropdownMenuItem>
                                ) : (
                                  <DropdownMenuGroup>
                                    {visibleDeliveryTargetOptions.map((target) => {
                                      const selected = deliveryTargets.some((selectedTarget) => deliveryTargetKey(selectedTarget) === deliveryTargetKey(target));
                                      return (
                                        <DropdownMenuItem
                                          key={deliveryTargetKey(target)}
                                          role="menuitemcheckbox"
                                          aria-checked={selected}
                                          onSelect={(e) => {
                                            e.preventDefault();
                                            toggleDeliveryTarget(target);
                                          }}
                                        >
                                          <span className="flex h-4 w-4 items-center justify-center">{selected && <IconCheck size={13} />}</span>
                                          <span className="min-w-0 flex-1 truncate">{target.label}</span>
                                        </DropdownMenuItem>
                                      );
                                    })}
                                  </DropdownMenuGroup>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 border-b border-[var(--border-tertiary)] px-4 py-3 lg:grid-cols-[150px_minmax(0,1fr)]">
                    <div>
                      <div className="type-caption font-medium text-[var(--text-primary)]">Weekly Digest</div>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="flex h-8 items-center gap-2 rounded-[7px] border border-[var(--border-tertiary)] bg-[var(--bg-primary)] px-2.5 type-caption font-medium text-[var(--text-primary)]">
                        <input
                          type="checkbox"
                          checked={weeklyDigestEnabled}
                          onChange={(event) => setWeeklyDigestEnabled(event.target.checked)}
                          className="h-3.5 w-3.5 shrink-0 accent-[var(--canon-purple)]"
                        />
                        <IconCalendar size={13} />
                        <span>{weeklyDigestStatus}</span>
                      </label>
                      <label className="space-y-1">
                        <span className="sr-only">Digest Day</span>
                        <select
                          value={digestWeekday}
                          onChange={(event) => setDigestWeekday(Number(event.target.value))}
                          disabled={!weeklyDigestEnabled}
                          className="h-8 min-w-[132px] rounded-md border border-[var(--border-secondary)] bg-[var(--bg-primary)] px-2 type-caption font-medium text-[var(--text-primary)] disabled:opacity-50"
                        >
                          {digestWeekdays.map((weekday) => (
                            <option key={weekday.value} value={weekday.value}>{weekday.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="sr-only">Digest Hour UTC</span>
                        <Input
                          type="number"
                          min={0}
                          max={23}
                          value={digestHourUtc}
                          disabled={!weeklyDigestEnabled}
                          onChange={(event) => setDigestHourUtc(Math.min(23, Math.max(0, Number(event.target.value))))}
                          className="h-8 w-[92px] bg-[var(--bg-primary)] type-caption font-medium"
                        />
                      </label>
                      <span className="pb-2 type-caption text-[var(--text-tertiary)]">UTC</span>
                    </div>
                  </div>

                  <div className="grid gap-3 px-4 py-3 lg:grid-cols-[150px_minmax(0,1fr)]">
                    <div>
                      <div className="type-caption font-medium text-[var(--text-primary)]">Meeting Prep</div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-end gap-2">
                        <label className="flex h-8 items-center gap-2 rounded-[7px] border border-[var(--border-tertiary)] bg-[var(--bg-primary)] px-2.5 type-caption font-medium text-[var(--text-primary)]">
                          <input
                            type="checkbox"
                            checked={meetingPrepEnabled}
                            onChange={(event) => setMeetingPrepEnabled(event.target.checked)}
                            className="h-3.5 w-3.5 shrink-0 accent-[var(--canon-purple)]"
                          />
                          <IconClock size={13} />
                          <span>{meetingPrepStatus}</span>
                        </label>
                        <label className="space-y-1">
                          <span className="sr-only">Meeting Prep Minutes Before Meeting</span>
                          <Input
                            type="number"
                            min={5}
                            max={240}
                            value={meetingPrepMinutesBefore}
                            disabled={!meetingPrepEnabled}
                            onChange={(event) => setMeetingPrepMinutesBefore(Math.min(240, Math.max(5, Number(event.target.value))))}
                            className="h-8 w-[92px] bg-[var(--bg-primary)] type-caption font-medium"
                          />
                        </label>
                        <span className="pb-2 type-caption text-[var(--text-tertiary)]">Minutes Before</span>
                      </div>

                      <div className="max-w-[420px] space-y-2">
                        <div className="type-caption font-medium text-[var(--text-secondary)]">Recipients</div>
                        <SlackUserPicker
                          value={null}
                          onChange={addMeetingPrepRecipient}
                          placeholder="Add a Slack teammate"
                          disabled={!meetingPrepEnabled || !activeProviderConnected}
                        />
                        {meetingPrepRecipients.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {meetingPrepRecipients.map((recipient) => (
                              <span
                                key={recipient.id}
                                className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-[6px] border border-[var(--border-tertiary)] bg-[var(--bg-primary)] px-2 type-caption font-medium text-[var(--text-secondary)]"
                              >
                                <span className="truncate">{recipient.name}</span>
                                <button
                                  type="button"
                                  onClick={() => removeMeetingPrepRecipient(recipient.id)}
                                  className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                                  aria-label={`Remove ${recipient.name}`}
                                >
                                  <IconX size={12} />
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : meetingPrepEnabled ? (
                          <div className="type-caption text-[var(--amber-text)]">Choose who should receive meeting briefings.</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </section>
              </div>
              <div className="shrink-0 border-t border-[var(--border-tertiary)] bg-[var(--bg-secondary)] px-7 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="type-caption text-[var(--text-tertiary)]">
                    Weekly updates use channels. Meeting briefings use recipients.
                  </div>
                  <Button
                    size="sm"
                    onClick={saveDeliverySettings}
                    disabled={savingDeliverySettings || !activeDeliveryProvider || !activeProviderConnected}
                    className="shrink-0"
                  >
                    {savingDeliverySettings ? 'Saving...' : 'Save Delivery Settings'}
                  </Button>
                </div>
              </div>
            </>
          ) : selectedItem ? (
            <>
              <div className="detail-page-header px-8 py-5 border-b">
                <div className="mb-3 flex items-center gap-2 flex-wrap">
                  <StatusBadge
                    variant={statusBadge[selectedItem.status]}
                    label={statusLabels[selectedItem.status]}
                  />
                  <span className="type-body" style={{ color: 'var(--text-tertiary)' }}>
                    {formatTimestamp(selectedItem.sent_at)}
                  </span>
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
                      <span>· {signalsReviewed} source item{signalsReviewed === 1 ? '' : 's'} reviewed</span>
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
                        ? `Sent ${formatTimestamp(selectedItem.sent_at)}.`
                        : `${unsentCategoryItems.length} update${unsentCategoryItems.length === 1 ? '' : 's'} ready in this filter.`}
                    </p>
                  </StepRow>
                </div>
              </div>
              <div className="shrink-0 border-t border-[var(--border-tertiary)] bg-[var(--bg-secondary)] px-8 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="type-caption text-[var(--text-tertiary)]">
                    {selectedItem.status === 'sent'
                      ? `Sent ${formatTimestamp(selectedItem.sent_at)}.`
                      : hasDeliveryTargets
                        ? 'Send this update to the configured destination.'
                        : 'Choose a delivery destination before sending.'}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => void sendSignal(selectedItem)}
                    disabled={rowActionId === selectedItem.id || selectedItem.status === 'sent'}
                  >
                    <IconSend size={13} />
                    {rowActionId === selectedItem.id ? 'Sending...' : selectedItem.status === 'sent' ? 'Sent' : 'Send Update'}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
              {generating ? (
                <IconBrain size={32} style={{ color: 'var(--canon-purple)', opacity: 0.7 }} />
              ) : (
                <IconRadar size={32} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
              )}
              <div className="type-section-title" style={{ color: 'var(--text-secondary)' }}>
                {generating ? 'Checking sources...' : items.length === 0 ? 'No updates yet' : 'No update selected'}
              </div>
              <div className="type-body text-center max-w-[280px] leading-[1.5]" style={{ color: 'var(--text-tertiary)' }}>
                {generating
                  ? 'Canon is checking connected sources for updates your team may need.'
                  : items.length === 0
                    ? hasKnowledgeSources
                      ? 'Check your connected sources for changes your team should know about.'
                      : 'Add a source so Canon can look for useful team updates.'
                    : 'Choose an update from the list to review the details.'}
              </div>
              {!generating && items.length === 0 && (
                hasKnowledgeSources ? (
                  <Button size="sm" className="mt-1" onClick={generateSignals}>
                    <IconBrain size={13} /> Find Updates
                  </Button>
                ) : (
                  <Link href="/knowledge">
                    <Button size="sm" className="mt-1">Add Knowledge Sources</Button>
                  </Link>
                )
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={!!deleteRequest}
        onOpenChange={(open) => {
          if (!open && !deletingSignals) setDeleteRequest(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {deleteRequest?.items.length === 1 ? 'Delete readiness signal?' : `Delete ${deleteRequest?.items.length ?? 0} readiness signals?`}
            </DialogTitle>
            <DialogDescription>
              {deleteRequest?.items.length === 1
                ? `This permanently removes "${deleteRequest.items[0]?.title}" from Canon. This cannot be undone.`
                : 'This permanently removes the selected readiness signals from Canon. This cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteRequest(null)} disabled={deletingSignals}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void confirmSignalDelete()} disabled={deletingSignals}>
              <IconTrash size={14} />
              {deletingSignals
                ? 'Deleting...'
                : deleteRequest?.items.length === 1
                  ? 'Delete Signal'
                  : 'Delete Signals'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
