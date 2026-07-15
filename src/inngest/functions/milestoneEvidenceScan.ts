import { inngest } from '../client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { createLogger, errorMessage } from '@/lib/server/logging';
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

async function activeOrganizationsWithHires(supabase: ReturnType<typeof createServiceRoleClient>) {
  const { data, error } = await supabase
    .from('new_hires')
    .select('organization_id')
    .eq('status', 'active');

  if (error) throw error;
  return Array.from(new Set((data ?? []).map((row: { organization_id: string }) => row.organization_id)));
}

export const milestoneEvidenceScan = inngest.createFunction(
  {
    id: 'milestone-evidence-scan',
    name: 'Canon: Scan Source Events for Milestone Proof',
    retries: 1,
    concurrency: {
      limit: 1,
      key: 'event.data.organizationId',
    },
  },
  { event: 'onboarding/milestones.evidence.scan.requested' },
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

export const milestoneEvidenceScheduledScan = inngest.createFunction(
  {
    id: 'milestone-evidence-scheduled-scan',
    name: 'Canon: Scan Milestone Proof Every 3 Hours',
    retries: 1,
  },
  { cron: '0 */3 * * *' },
  async ({ step }) => {
    const supabase = createServiceRoleClient();
    log.info('scan_start', { cadence: 'every_3_hours' });

    const organizationIds = await step.run('load-active-hire-organizations', () => activeOrganizationsWithHires(supabase));
    if (organizationIds.length === 0) {
      log.info('scan_skipped', { reason: 'no_active_hires' });
      return { ok: true, organizations: 0, checked: 0, matches: 0, failed: 0 };
    }

    let checked = 0;
    let matches = 0;
    let failed = 0;

    for (const organizationId of organizationIds) {
      try {
        const result = await step.run(`scan-org-${organizationId}`, () => scanMilestoneEvidenceForOrganization({
          supabase,
          organizationId,
        }));
        checked += result.checked;
        matches += result.matches;
        failed += result.failed;
      } catch (error) {
        failed++;
        log.warn('scan_failed', { organizationId, error: errorMessage(error) });
      }
    }

    log.info('scan_complete', {
      organizations: organizationIds.length,
      checked,
      matches,
      failed,
    });

    return { ok: true, organizations: organizationIds.length, checked, matches, failed };
  }
);
