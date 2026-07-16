import { inngest } from '../client';
import { INNGEST_CRONS, INNGEST_EVENTS, INNGEST_FUNCTION_IDS } from '../constants';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/server/logging';
import { scanMilestoneEvidenceForOrganization } from '@/lib/server/milestoneEvidenceScanner';

type MilestoneEvidenceScanEvent = {
  organizationId?: string;
  hireId?: string | null;
  sourceId?: string | null;
  reason?: string | null;
};

const log = createLogger('inngest.milestone_evidence_scan', {
  label: 'Milestone Evidence Scan',
  eventLabels: {
    scan_start: 'Scan Started',
    scan_complete: 'Scan Complete',
    scan_failed: 'Scan Failed',
    scan_skipped: 'Scan Skipped',
  },
  componentColor: 'orange',
});

export const scanMilestoneEvidence = inngest.createFunction(
  {
    id: INNGEST_FUNCTION_IDS.SCAN_MILESTONE_EVIDENCE,
    name: 'Canon: Scan Source Events for Milestone Proof',
    retries: 1,
    concurrency: {
      limit: 1,
      key: 'event.data.organizationId',
    },
  },
  { event: INNGEST_EVENTS.MILESTONE_EVIDENCE_SCAN_REQUESTED },
  async ({ event, step }) => {
    const data = (event.data ?? {}) as MilestoneEvidenceScanEvent;
    const organizationId = typeof data.organizationId === 'string' ? data.organizationId : '';
    if (!organizationId) return { skipped: true, reason: 'missing_organization_id' };

    const supabase = createServiceRoleClient();
    log.info('scan_start', {
      organizationId,
      hireId: data.hireId ?? null,
      sourceId: data.sourceId ?? null,
      reason: data.reason ?? 'event',
    });

    const result = await step.run(`scan-org-${organizationId}`, () => scanMilestoneEvidenceForOrganization({
      supabase,
      organizationId,
      hireId: typeof data.hireId === 'string' ? data.hireId : null,
      triggerType: 'source_sync',
    }));

    log.info('scan_complete', { organizationId, ...result });
    return result;
  }
);

export const scanMilestoneEvidenceOnSchedule = inngest.createFunction(
  {
    id: INNGEST_FUNCTION_IDS.SCAN_MILESTONE_EVIDENCE_ON_SCHEDULE,
    name: 'Canon: Check Milestone Proof Every 30 Minutes',
    retries: 1,
    concurrency: { limit: 1 },
  },
  { cron: INNGEST_CRONS.MILESTONE_EVIDENCE_DUE_CHECK },
  async ({ step }) => {
    const supabase = createServiceRoleClient();
    const organizationIds = await step.run('load-active-organizations', async () => {
      const { data, error } = await supabase
        .from('new_hires')
        .select('organization_id')
        .eq('status', 'active');

      if (error) throw error;
      return Array.from(new Set((data ?? []).map((hire) => hire.organization_id)));
    });

    const results = [];
    for (const organizationId of organizationIds) {
      const result = await step.run(`scan-org-${organizationId}`, () => scanMilestoneEvidenceForOrganization({
        supabase,
        organizationId,
        triggerType: 'scheduled',
      }));
      results.push(result);
    }

    return {
      organizations: organizationIds.length,
      hires: results.reduce((total, result) => total + result.hires, 0),
      checked: results.reduce((total, result) => total + result.checked, 0),
      matches: results.reduce((total, result) => total + result.matches, 0),
      failed: results.reduce((total, result) => total + result.failed, 0),
    };
  }
);
