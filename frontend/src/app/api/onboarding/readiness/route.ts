import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { sendSlackMessage } from '@/lib/server/signals/delivery';
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

function isReadinessStatus(value: unknown): value is ReadinessStatus {
  return typeof value === 'string' && updateableStatuses.includes(value as ReadinessStatus);
}

function metadataStringArray(item: ReadinessItem, key: string) {
  const value = item.source_metadata?.[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : [];
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

async function fallbackReadinessChannel(supabase: Awaited<ReturnType<typeof createClient>>, organizationId: string) {
  const { data: source } = await supabase
    .from('knowledge_sources')
    .select('slack_channel_id')
    .eq('organization_id', organizationId)
    .eq('provider', 'slack')
    .not('slack_channel_id', 'is', null)
    .order('last_synced_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  return typeof source?.slack_channel_id === 'string' ? source.slack_channel_id : null;
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
    return NextResponse.json({ brief: buildReadinessBrief((items ?? []) as ReadinessItem[]) });
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

    const body = (await request.json().catch(() => ({}))) as { category?: string; categories?: unknown; itemIds?: unknown };
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

    const supabase = await createClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

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
      return NextResponse.json({ error: 'No unsent readiness items found' }, { status: 400 });
    }

    const channel =
      readinessItems.flatMap((item) => metadataStringArray(item, 'channel_ids'))[0] ??
      (await fallbackReadinessChannel(supabase, org.id));

    if (!channel) {
      return NextResponse.json({ error: 'No Slack channel found for readiness note' }, { status: 400 });
    }

    const text = buildReadinessNote(readinessItems, categories);
    const sent = await sendSlackMessage({
      supabase,
      userId: user.id,
      channel,
      text,
    });

    if (!sent.sent) {
      return NextResponse.json({ error: 'Failed to send readiness note', detail: sent.reason }, { status: 502 });
    }

    const sentAt = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from('readiness_items')
      .update({ status: 'sent', sent_at: sentAt, updated_at: sentAt })
      .in('id', readinessItems.map((item) => item.id))
      .select('*');

    if (updateError) throw updateError;

    return NextResponse.json({
      sent: true,
      channel,
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

    return NextResponse.json({ item });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/readiness] PATCH failed', error);
    return NextResponse.json({ error: 'Failed to update readiness item', detail: message }, { status: 500 });
  }
}
