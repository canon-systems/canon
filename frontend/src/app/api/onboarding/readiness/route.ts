import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type {
  HireRole,
  ReadinessAffectedRole,
  ReadinessBrief,
  ReadinessCategory,
  ReadinessImpactLevel,
  ReadinessItem,
} from '@/types/onboarding';

export const dynamic = 'force-dynamic';

const categoryOrder: ReadinessCategory[] = [
  'product_change',
  'customer_objection',
  'demo_guidance',
  'implementation_pattern',
];

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
