import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/inngest/client';
import { sendSlackDirectMessage, sendSlackMessage, type SlackDeliveryResult } from '@/lib/server/signals/delivery';
import { createLogger } from '@/lib/server/logging';
import type {
  HireRole,
  ReadinessAffectedRole,
  ReadinessBrief,
  ReadinessCategory,
  ReadinessImpactLevel,
  ReadinessItem,
  ReadinessStatus,
} from '@/types/onboarding';

export const dynamic = 'force-dynamic';

const log = createLogger('api.onboarding.readiness', {
  label: 'Readiness API',
  eventLabels: {
    send_requested: 'Send Requested',
    send_target_resolved: 'Send Target Resolved',
    send_target_missing: 'Send Target Missing',
    send_items_selected: 'Send Items Selected',
    send_delivery_result: 'Send Delivery Result',
    send_failed: 'Send Failed',
    send_status_updated: 'Send Status Updated',
    status_update_requested: 'Status Update Requested',
    status_update_completed: 'Status Update Completed',
  },
});

const categoryOrder: ReadinessCategory[] = [
  'product_change',
  'customer_objection',
  'demo_guidance',
  'implementation_pattern',
];

const validStatusesToSend = ['draft', 'reviewed'];
const updateableStatuses: ReadinessStatus[] = ['draft', 'reviewed', 'sent', 'archived'];

const categoryTitles: Record<ReadinessCategory, string> = {
  product_change: 'Product Changes',
  customer_objection: 'Customer Objections',
  demo_guidance: 'Demo Guidance',
  implementation_pattern: 'Implementation Patterns',
};

const impactLabels: Record<ReadinessImpactLevel, ReadinessAffectedRole['impact']> = {
  high: 'High impact',
  medium: 'Medium impact',
  low: 'Low impact',
};

const impactProgress: Record<ReadinessImpactLevel, number> = {
  high: 86,
  medium: 58,
  low: 31,
};

const impactRank: Record<ReadinessImpactLevel, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function metadataNumber(item: ReadinessItem, key: string) {
  const value = item.source_metadata?.[key];
  return typeof value === 'number' ? value : 0;
}

function recommendationSentence(action: string) {
  const normalized = action.replace(/^send /i, 'sending ');
  return `Canon recommends ${normalized}`;
}

function isReadinessCategory(value: unknown): value is ReadinessCategory {
  return typeof value === 'string' && categoryOrder.includes(value as ReadinessCategory);
}

function validReadinessCategories(values: unknown) {
  return Array.isArray(values) ? values.filter(isReadinessCategory) : [];
}

function validReadinessItemIds(values: unknown) {
  return Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) : [];
}

function validSlackDmTargets(values: unknown) {
  return Array.isArray(values)
    ? values
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim())
        .filter((value) => value !== 'USLACKBOT')
        .filter((value) => /^[DU][A-Z0-9]+$/.test(value))
    : [];
}

function isReadinessStatus(value: unknown): value is ReadinessStatus {
  return typeof value === 'string' && updateableStatuses.includes(value as ReadinessStatus);
}

function metadataStringArray(item: ReadinessItem, key: string) {
  const value = item.source_metadata?.[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : [];
}

type ReadinessSourceEvidence = {
  provider: string;
  channel_id: string | null;
  channel_name: string | null;
  message_ts: string | null;
  url: string | null;
};

function slackMessageUrl(channelId: string, messageTs: string | null) {
  const params = new URLSearchParams({ channel: channelId });
  if (messageTs) params.set('message_ts', messageTs);
  return `https://slack.com/app_redirect?${params.toString()}`;
}

function metadataEvidenceArray(item: ReadinessItem): ReadinessSourceEvidence[] {
  const value = item.source_metadata?.source_evidence;
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const evidence = entry as Record<string, unknown>;
    const provider = typeof evidence.provider === 'string' ? evidence.provider : item.source ?? 'source';
    const channelId = typeof evidence.channel_id === 'string' ? evidence.channel_id : null;
    const channelName = typeof evidence.channel_name === 'string' ? evidence.channel_name : null;
    const messageTs = typeof evidence.message_ts === 'string' ? evidence.message_ts : null;
    const url = typeof evidence.url === 'string' ? evidence.url : channelId ? slackMessageUrl(channelId, messageTs) : null;
    if (!channelId && !channelName && !url) return [];
    return [{ provider, channel_id: channelId, channel_name: channelName, message_ts: messageTs, url }];
  });
}

function withFallbackSourceMetadata(items: ReadinessItem[], fallback: { channelId: string | null; channelName: string | null }) {
  if (!fallback.channelId && !fallback.channelName) return items;

  return items.map((item) => {
    if (item.source !== 'slack') return item;

    const sourceMetadata = item.source_metadata ?? {};
    const channelIds = metadataStringArray(item, 'channel_ids');
    const channelNames = metadataStringArray(item, 'channel_names');
    const sourceEvidence = metadataEvidenceArray(item);

    if (channelIds.length > 0 && channelNames.length > 0 && sourceEvidence.length > 0) return item;

    return {
      ...item,
      source_metadata: {
        ...sourceMetadata,
        channel_ids: channelIds.length > 0 ? channelIds : fallback.channelId ? [fallback.channelId] : [],
        channel_names: channelNames.length > 0 ? channelNames : fallback.channelName ? [fallback.channelName] : [],
        source_evidence: sourceEvidence.length > 0
          ? sourceEvidence
          : [{
              provider: 'slack',
              channel_id: fallback.channelId,
              channel_name: fallback.channelName,
              message_ts: null,
              url: fallback.channelId ? slackMessageUrl(fallback.channelId, null) : null,
            }],
      },
    };
  });
}

function readinessNoteTitle(categories: ReadinessCategory[] | null) {
  if (!categories || categories.length === 0 || categories.length === categoryOrder.length) return 'Readiness';
  if (categories.length === 1) return categoryTitles[categories[0]];
  return categories.map((category) => categoryTitles[category]).join(', ');
}

function buildReadinessNote(items: ReadinessItem[], categories: ReadinessCategory[] | null) {
  const title = readinessNoteTitle(categories);
  const lines = [
    `*${title} update*`,
    '',
    ...items.flatMap((item) => [
      `*${item.title}*`,
      item.summary,
      item.recommended_action ? `_Recommended action:_ ${item.recommended_action}` : '',
      '',
    ]),
  ];

  return lines.filter((line, index, all) => line || all[index - 1]).join('\n').trim();
}


async function fallbackReadinessSource(supabase: Awaited<ReturnType<typeof createClient>>, organizationId: string) {
  const { data: source } = await supabase
    .from('knowledge_sources')
    .select('name, slack_channel_id, slack_channel_name')
    .eq('organization_id', organizationId)
    .eq('provider', 'slack')
    .order('last_synced_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  return {
    channelId: typeof source?.slack_channel_id === 'string' ? source.slack_channel_id : null,
    channelName: typeof source?.slack_channel_name === 'string'
      ? source.slack_channel_name
      : typeof source?.name === 'string'
        ? source.name.replace(/^#/, '')
        : null,
  };
}

function buildReadinessBrief(items: ReadinessItem[]): ReadinessBrief | null {
  if (items.length === 0) return null;

  const sortedItems = [...items].sort((a, b) => {
    const categoryDiff = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
    if (categoryDiff !== 0) return categoryDiff;
    return new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime();
  });

  const itemsByCategory = new Map<ReadinessCategory, ReadinessItem>();
  for (const item of sortedItems) {
    if (!itemsByCategory.has(item.category)) itemsByCategory.set(item.category, item);
  }

  const productChange = itemsByCategory.get('product_change');
  const customerObjection = itemsByCategory.get('customer_objection');
  const primaryAction = sortedItems.find((item) => item.recommended_action)?.recommended_action ?? null;

  const roleImpact = new Map<HireRole, ReadinessImpactLevel>();
  for (const item of sortedItems) {
    for (const role of item.affected_roles) {
      const existing = roleImpact.get(role);
      if (!existing || impactRank[item.impact_level] > impactRank[existing]) {
        roleImpact.set(role, item.impact_level);
      }
    }
  }

  const affected_roles = Array.from(roleImpact.entries())
    .map(([role, impactLevel]) => ({
      role,
      impact: impactLabels[impactLevel],
      progress: impactProgress[impactLevel],
    }))
    .sort((a, b) => b.progress - a.progress);

  const signalsReviewed = sortedItems.reduce((sum, item) => sum + metadataNumber(item, 'signals_reviewed'), 0);
  const staleAreas = sortedItems.reduce((sum, item) => sum + metadataNumber(item, 'stale_knowledge_areas'), 0);
  const milestonesCovered = Math.max(...sortedItems.map((item) => metadataNumber(item, 'milestones_covered_percent')), 0);

  return {
    title: 'This week\'s readiness brief',
    subtitle: 'Generated from Slack knowledge, field conversations, and milestone gaps.',
    detected_shift: [
      productChange?.title ? `${productChange.title}.` : productChange?.summary,
      customerObjection?.summary,
      primaryAction ? recommendationSentence(primaryAction) : null,
    ]
      .filter(Boolean)
      .join(' '),
    bullets: [
      ...sortedItems.slice(0, 3).map((item) => item.summary),
      ...(primaryAction ? [`Recommended action: ${primaryAction}`] : []),
    ],
    cards: categoryOrder.map((category) => {
      const item = itemsByCategory.get(category);
      return {
        category,
        title: categoryTitles[category],
        detail: item?.summary ?? 'No current signals.',
      };
    }),
    affected_roles,
    health_stats: [
      { label: 'Milestones covered', value: `${milestonesCovered}%` },
      { label: 'Stale knowledge areas', value: String(staleAreas) },
      { label: 'Signals reviewed', value: String(signalsReviewed) },
    ],
    items: sortedItems,
  };
}

export async function GET() {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = await createClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (!org) return NextResponse.json({ brief: null });

    const { data: items, error } = await supabase
      .from('readiness_items')
      .select('*')
      .eq('organization_id', org.id)
      .neq('status', 'archived')
      .order('detected_at', { ascending: false });

    if (error) throw error;
    const fallbackSource = await fallbackReadinessSource(supabase, org.id);
    const readinessItems = withFallbackSourceMetadata((items ?? []) as ReadinessItem[], fallbackSource);
    return NextResponse.json({ brief: buildReadinessBrief(readinessItems) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/readiness] GET failed', error);
    return NextResponse.json({ error: 'Failed to load readiness brief', detail: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      category?: string;
      categories?: unknown;
      itemIds?: unknown;
      channelIds?: unknown;
      userIds?: unknown;
    };
    const requestedCategory = body.category ? body.category : request.nextUrl.searchParams.get('category');
    if (requestedCategory && !isReadinessCategory(requestedCategory)) {
      return NextResponse.json({ error: 'Invalid readiness category' }, { status: 400 });
    }
    const requestedCategories = requestedCategory
      ? [requestedCategory as ReadinessCategory]
      : validReadinessCategories(body.categories);
    if (Array.isArray(body.categories) && requestedCategories.length !== body.categories.length) {
      return NextResponse.json({ error: 'Invalid readiness category' }, { status: 400 });
    }
    const categories = requestedCategories.length > 0 ? Array.from(new Set(requestedCategories)) : null;
    const itemIds = validReadinessItemIds(body.itemIds);
    if (Array.isArray(body.itemIds) && itemIds.length !== body.itemIds.length) {
      return NextResponse.json({ error: 'Invalid readiness item' }, { status: 400 });
    }
    const requestedChannelIds = Array.isArray(body.channelIds)
      ? body.channelIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0).map((id) => id.trim())
      : [];
    const userIds = validSlackDmTargets(body.userIds);

    log.info('send_requested', {
      userId: user.id,
      categoryCount: categories?.length ?? 0,
      itemIdCount: itemIds.length,
      requestedChannels: requestedChannelIds,
      requestedDmTargets: userIds.length,
    });

    const supabase = await createClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    if (body.action === 'generate') {
      await inngest.send({
        name: 'onboarding/readiness.generate.requested',
        data: { organizationId: org.id, ownerId: user.id },
      });
      return NextResponse.json({ ok: true, requested: true });
    }

    let query = supabase
      .from('readiness_items')
      .select('*')
      .eq('organization_id', org.id)
      .in('status', validStatusesToSend)
      .order('detected_at', { ascending: false });

    if (categories?.length) query = query.in('category', categories);
    if (itemIds.length > 0) query = query.in('id', itemIds);

    const { data: items, error } = await query;
    if (error) throw error;

    const readinessItems = (items ?? []) as ReadinessItem[];
    if (readinessItems.length === 0) {
      log.warn('send_failed', {
        userId: user.id,
        orgId: org.id,
        reason: 'no_unsent_readiness_items',
        categoryCount: categories?.length ?? 0,
        itemIdCount: itemIds.length,
      });
      return NextResponse.json({ error: 'No unsent readiness items found' }, { status: 400 });
    }

    log.info('send_items_selected', {
      userId: user.id,
      orgId: org.id,
      itemCount: readinessItems.length,
      itemIds: readinessItems.map((item) => item.id),
      categories: Array.from(new Set(readinessItems.map((item) => item.category))),
    });

    const resolvedChannelIds = requestedChannelIds;

    if (resolvedChannelIds.length === 0 && userIds.length === 0) {
      log.warn('send_target_missing', {
        userId: user.id,
        orgId: org.id,
        itemCount: readinessItems.length,
        requestedChannels: requestedChannelIds,
        dmTargets: userIds.length,
        reason: 'no_channel_or_dm_targets',
      });
      return NextResponse.json({ error: 'No delivery targets configured. Select at least one channel or user in the Delivery tab before sending.' }, { status: 400 });
    }

    log.info('send_target_resolved', {
      userId: user.id,
      orgId: org.id,
      channels: resolvedChannelIds,
      dmTargets: Array.from(new Set(userIds)),
      targetCount: resolvedChannelIds.length + Array.from(new Set(userIds)).length,
    });

    const text = buildReadinessNote(readinessItems, categories);
    const deliveries: Array<{ target: string; type: 'channel' | 'dm' } & SlackDeliveryResult> = [];

    for (const channel of resolvedChannelIds) {
      const sent = await sendSlackMessage({ userId: user.id, channel, text });
      deliveries.push({ target: channel, type: 'channel', ...sent });
    }

    for (const slackUserId of Array.from(new Set(userIds))) {
      const sent = await sendSlackDirectMessage({ userId: user.id, slackUserId, text });
      deliveries.push({ target: slackUserId, type: 'dm', ...sent });
    }

    const failedDelivery = deliveries.find((delivery) => !delivery.sent);
    for (const delivery of deliveries) {
      log.info('send_delivery_result', {
        userId: user.id,
        orgId: org.id,
        type: delivery.type,
        target: delivery.target,
        sent: delivery.sent,
        reason: delivery.reason,
        slackChannel: delivery.channel,
        slackTs: delivery.ts,
        permalink: delivery.permalink,
      });
    }

    if (failedDelivery) {
      const reconnectRequired = deliveries.length > 0 && deliveries.every((delivery) => (
        !delivery.sent && delivery.reason?.toLowerCase().includes('no active slack connection')
      ));
      log.warn('send_failed', {
        userId: user.id,
        orgId: org.id,
        itemCount: readinessItems.length,
        failedType: failedDelivery.type,
        failedTarget: failedDelivery.target,
        reason: failedDelivery.reason,
        deliveries,
      });
      return NextResponse.json({
        error: 'Failed to send readiness note',
        detail: failedDelivery.reason,
        deliveries,
        reconnect_required: reconnectRequired,
      }, { status: reconnectRequired ? 409 : 502 });
    }

    const sentAt = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from('readiness_items')
      .update({ status: 'sent', sent_at: sentAt, updated_at: sentAt })
      .in('id', readinessItems.map((item) => item.id))
      .select('*');

    if (updateError) throw updateError;

    log.info('send_status_updated', {
      userId: user.id,
      orgId: org.id,
      itemCount: readinessItems.length,
      sentAt,
    });

    return NextResponse.json({
      sent: true,
      channels: resolvedChannelIds,
      deliveries,
      count: readinessItems.length,
      items: updated ?? [],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/readiness] POST failed', error);
    return NextResponse.json({ error: 'Failed to send readiness note', detail: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { id?: unknown; status?: unknown };
    if (typeof body.id !== 'string' || body.id.trim().length === 0) {
      return NextResponse.json({ error: 'Readiness item id is required' }, { status: 400 });
    }
    if (!isReadinessStatus(body.status)) {
      return NextResponse.json({ error: 'Invalid readiness status' }, { status: 400 });
    }

    log.info('status_update_requested', {
      userId: user.id,
      itemId: body.id,
      status: body.status,
    });

    const supabase = await createClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    const updatedAt = new Date().toISOString();
    const update: Partial<ReadinessItem> = {
      status: body.status,
      updated_at: updatedAt,
      sent_at: body.status === 'sent' ? updatedAt : null,
    };

    const { data: item, error } = await supabase
      .from('readiness_items')
      .update(update)
      .eq('id', body.id)
      .eq('organization_id', org.id)
      .select('*')
      .maybeSingle();

    if (error) throw error;
    if (!item) return NextResponse.json({ error: 'Readiness item not found' }, { status: 404 });

    log.info('status_update_completed', {
      userId: user.id,
      orgId: org.id,
      itemId: item.id,
      status: item.status,
    });

    return NextResponse.json({ item });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/readiness] PATCH failed', error);
    return NextResponse.json({ error: 'Failed to update readiness item', detail: message }, { status: 500 });
  }
}
