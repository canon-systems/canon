import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { recordMilestoneEvidence } from '@/lib/server/milestoneEvidence';
import type { MilestoneEvidenceTrustLevel, MilestoneEvidenceType } from '@/types/onboarding';

export const dynamic = 'force-dynamic';

const evidenceTypes: MilestoneEvidenceType[] = [
  'access_readiness',
  'tool_activity',
  'communication_activity',
  'customer_exposure',
  'manager_verification',
  'new_hire_blocker',
];

const trustLevels: MilestoneEvidenceTrustLevel[] = ['low', 'medium', 'high'];

function stringField(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isEvidenceType(value: unknown): value is MilestoneEvidenceType {
  return typeof value === 'string' && evidenceTypes.includes(value as MilestoneEvidenceType);
}

function isTrustLevel(value: unknown): value is MilestoneEvidenceTrustLevel {
  return typeof value === 'string' && trustLevels.includes(value as MilestoneEvidenceTrustLevel);
}

function confidence(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : undefined;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const apiKey = request.headers.get('x-canon-evidence-key');
    const expectedKey = process.env.MILESTONE_EVIDENCE_API_KEY;
    const trustedApiKey = Boolean(expectedKey && apiKey && apiKey === expectedKey);

    const newHireId = stringField(body.new_hire_id);
    const milestoneId = stringField(body.milestone_id);
    const evidenceType = body.evidence_type;
    const trustLevel = body.trust_level;

    if (!newHireId || !milestoneId || !isEvidenceType(evidenceType) || !isTrustLevel(trustLevel)) {
      return NextResponse.json({
        error: 'new_hire_id, milestone_id, evidence_type, and trust_level are required',
      }, { status: 400 });
    }

    const source = stringField(body.source) || (trustedApiKey ? 'trusted_integration' : 'manual');
    const sourceEventId = stringField(body.source_event_id) || null;
    const sourceUrl = stringField(body.source_url) || null;
    const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
      ? body.metadata as Record<string, unknown>
      : {};

    if (trustedApiKey) {
      const serviceSupabase = createServiceRoleClient();
      const organizationId = stringField(body.organization_id);
      if (!organizationId) return NextResponse.json({ error: 'organization_id is required for trusted evidence' }, { status: 400 });

      const { data: hire } = await serviceSupabase
        .from('new_hires')
        .select('id')
        .eq('id', newHireId)
        .eq('organization_id', organizationId)
        .single();

      if (!hire) return NextResponse.json({ error: 'New hire not found for organization' }, { status: 404 });

      const result = await recordMilestoneEvidence({
        supabase: serviceSupabase,
        newHireId,
        milestoneId,
        evidenceType,
        trustLevel,
        confidence: confidence(body.confidence),
        source,
        sourceEventId,
        sourceUrl,
        metadata,
      });

      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json(result);
    }

    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = await createClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    const { data: hire } = await supabase
      .from('new_hires')
      .select('id')
      .eq('id', newHireId)
      .eq('organization_id', org.id)
      .single();

    if (!hire) return NextResponse.json({ error: 'New hire not found' }, { status: 404 });

    const result = await recordMilestoneEvidence({
      supabase,
      newHireId,
      milestoneId,
      evidenceType,
      trustLevel,
      confidence: confidence(body.confidence),
      source,
      sourceEventId,
      sourceUrl,
      metadata,
      createdBy: user.id,
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/milestone-evidence] POST failed', error);
    return NextResponse.json({ error: 'Failed to record milestone evidence', detail: message }, { status: 500 });
  }
}
