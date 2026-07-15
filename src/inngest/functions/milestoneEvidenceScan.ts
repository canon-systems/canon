import { inngest } from '../client';
import { INNGEST_EVENTS, INNGEST_FUNCTION_IDS } from '../constants';
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
    }));

    log.info('scan_complete', { organizationId, ...result });
    return result;
  }
);
