import { computeBaselineWindow, diffDelta, emptyCanonicalDiff } from '@/lib/server/diff/contracts';
import { runDiffForSourcesWithBreakdown, type DiffAggWithBreakdown } from '@/lib/server/diff/runDiffForSources';
import { formatDateRange } from '@/lib/server/diff/renderers';
import { buildAkusForSources } from '@/lib/server/services/akuBuilder';
import { planKnowledgePush, createSinglePagePlan } from '@/lib/server/services/knowledgePushPlanner';
import { runKnowledgePush } from '@/lib/server/services/knowledgePushRunner';
import { trackAutomationRun } from '@/lib/server/services/usageTracking';
import { getWindowForCadence } from './cadence';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ReportScheduleRow = {
  id: string;
  user_id: string;
  type: 'diff' | 'projection';
  name: string | null;
  enabled: boolean;
  cadence: string;
  source_ids: string[];
  communication: Record<string, unknown>;
  audiences: string[];
  units: string[];
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_error: string | null;
  run_at_time?: string | null;
  run_at_timezone?: string | null;
  run_at_weekday?: number | null;
  run_at_month_day?: number | null;
  /** RFC 5545 RRULE (UTC). Used with dtstart for next_run_at. */
  rrule?: string | null;
  /** First occurrence for recurrence (UTC). */
  dtstart?: string | null;
  /** Next run time (UTC). Source of truth for tick. */
  next_run_at?: string | null;
};

function buildPerSourceSection(
  primary: DiffAggWithBreakdown,
  baseline: DiffAggWithBreakdown,
  formatMetric: (label: string, value: number, deltaValue: number) => string
): string {
  if (!primary.sources.length) return '';

  const blocks: string[] = ['### By source'];

  for (const source of primary.sources) {
    const p = primary.bySource[source.id] || emptyCanonicalDiff(primary.aggregate.window);
    const b = baseline.bySource[source.id] || emptyCanonicalDiff(baseline.aggregate.window);
    const d = diffDelta(p, b);
    const repoDelta = `- **Repos touched:** ${p.repos_touched.length} (Δ +${d.repos_added.length} / -${d.repos_removed.length})`;
    const repoList = p.repos_touched.length ? `  - Repos: ${p.repos_touched.join(', ')}` : '';

    blocks.push(
      [
        `#### ${source.display_name}`,
        formatMetric('Tickets moved', p.tickets_moved, d.tickets_moved),
        formatMetric('Tickets completed', p.tickets_completed, d.tickets_completed),
        formatMetric('Tickets regressed', p.tickets_regressed, d.tickets_regressed),
        formatMetric('Tickets created', p.tickets_created, d.tickets_created),
        formatMetric('PRs merged', p.prs_merged, d.prs_merged),
        formatMetric('PRs opened', p.prs_opened, d.prs_opened),
        formatMetric('PRs closed', p.prs_closed, d.prs_closed),
        formatMetric('Commits to default', p.commits_default, d.commits_default),
        repoDelta,
        repoList,
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  return blocks.join('\n\n');
}

/**
 * Run a single report schedule: execute diff or projection, then record the run.
 */
export async function runReportSchedule(
  schedule: ReportScheduleRow,
  supabase: SupabaseClient
): Promise<{ status: 'succeeded' | 'failed'; runId?: string; error?: string }> {
  const startedAt = Date.now();
  const now = new Date();

  try {
    if (schedule.type === 'diff') {
      const primaryWindow = getWindowForCadence(schedule.cadence, now);
      const baselineWindow = computeBaselineWindow(primaryWindow.start, primaryWindow.end);
      const sourceIds = Array.isArray(schedule.source_ids) ? schedule.source_ids : [];

      const [primaryResult, baselineResult] = await Promise.all([
        runDiffForSourcesWithBreakdown(schedule.user_id, sourceIds, primaryWindow, supabase),
        runDiffForSourcesWithBreakdown(schedule.user_id, sourceIds, baselineWindow, supabase),
      ]);
      const primaryCanonical = primaryResult.aggregate;
      const baselineCanonical = baselineResult.aggregate;
      const delta = diffDelta(primaryCanonical, baselineCanonical);

      // KB delivery for diff: push report to Notion/Confluence if configured (same layout as Knowledge page)
      const comm = schedule.communication || {};
      const kbEnabled = comm.kb === true;
      const kbProvider = comm.kb_provider === 'notion' || comm.kb_provider === 'confluence' ? comm.kb_provider : null;
      const kbResourceId = typeof comm.kb_resource_id === 'string' ? comm.kb_resource_id : null;
      if (kbEnabled && kbProvider && kbResourceId) {
        try {
          const title = schedule.name || 'Diff Report';
          const formatDelta = (n: number) => (n === 0 ? '0' : n > 0 ? `+${n}` : `${n}`);
          const formatMetric = (label: string, value: number, deltaValue: number) =>
            `- **${label}:** ${value} (Δ ${formatDelta(deltaValue)})`;

          const perSourceLines = buildPerSourceSection(primaryResult, baselineResult, formatMetric);

          const lines = [
            '## High-level metrics (all sources)',
            '',
            `**Primary:** ${formatDateRange(primaryWindow.start, primaryWindow.end)}`,
            `**Baseline:** ${formatDateRange(baselineWindow.start, baselineWindow.end)}`,
            '',
            '### Metrics',
            formatMetric('Tickets moved', primaryCanonical.tickets_moved, delta.tickets_moved),
            formatMetric('Tickets completed', primaryCanonical.tickets_completed, delta.tickets_completed),
            formatMetric('Tickets regressed', primaryCanonical.tickets_regressed, delta.tickets_regressed),
            formatMetric('Tickets created', primaryCanonical.tickets_created, delta.tickets_created),
            formatMetric('PRs merged', primaryCanonical.prs_merged, delta.prs_merged),
            formatMetric('PRs opened', primaryCanonical.prs_opened, delta.prs_opened),
            formatMetric('PRs closed', primaryCanonical.prs_closed, delta.prs_closed),
            formatMetric('Commits to default', primaryCanonical.commits_default, delta.commits_default),
            `- **Repos touched:** ${primaryCanonical.repos_touched?.length ?? 0} (Δ +${delta.repos_added?.length ?? 0} / -${delta.repos_removed?.length ?? 0})`,
            '',
            primaryCanonical.repos_touched?.length ? `**Repos:** ${primaryCanonical.repos_touched.join(', ')}` : '',
            '',
            perSourceLines,
          ].filter(Boolean);
          const diffMarkdown = lines.join('\n');
          const plan = createSinglePagePlan(title, diffMarkdown);
          const existingRootResourceId =
            comm && typeof comm.kb_page_id === 'string' && comm.kb_page_id.trim().length ? comm.kb_page_id : null;

          const { rootPageId } = await runKnowledgePush({
            supabase,
            userId: schedule.user_id,
            provider: kbProvider,
            plan,
            rootResourceId: kbResourceId,
            rootMetadata: (comm.kb_root_metadata as Record<string, unknown>) || undefined,
            connectionId: (comm.kb_connection_id as string | null) || null,
            existingRootResourceId,
          });

          if (rootPageId && rootPageId !== existingRootResourceId) {
            const nextComm = { ...comm, kb_page_id: rootPageId };
            await supabase
              .from('report_schedules')
              .update({ communication: nextComm, updated_at: new Date().toISOString() })
              .eq('id', schedule.id)
              .eq('user_id', schedule.user_id);
          }
        } catch (kbErr) {
          const kbMessage = kbErr instanceof Error ? kbErr.message : String(kbErr);
          console.error('[runReportSchedule] diff KB push failed', kbErr);
          const executionTimeMs = Date.now() - startedAt;
          await supabase.from('report_schedule_runs').insert({
            user_id: schedule.user_id,
            report_schedule_id: schedule.id,
            executed_at: now.toISOString(),
            trigger_type: 'scheduled',
            status: 'failed',
            execution_time_ms: executionTimeMs,
            errors: [{ message: kbMessage }],
            result_summary: {
              type: 'diff',
              primary: primaryWindow,
              baseline: baselineWindow,
              kb_push_error: kbMessage,
            },
          });
          await supabase
            .from('report_schedules')
            .update({
              last_run_at: now.toISOString(),
              last_run_status: 'failed',
              last_run_error: `KB push: ${kbMessage}`,
              updated_at: now.toISOString(),
            })
            .eq('id', schedule.id)
            .eq('user_id', schedule.user_id);
          const diffSourceId = sourceIds[0] ?? schedule.id;
          trackAutomationRun(supabase, schedule.user_id, {
            sourceId: diffSourceId,
            triggerType: 'scheduled',
            status: 'failed',
            executionTimeMs,
            automationRuleId: schedule.id,
            errors: [kbMessage],
          }).catch((e) => console.warn('[runReportSchedule] track automation run failed', e));
          return { status: 'failed', error: `KB push: ${kbMessage}` };
        }
      }

      const executionTimeMs = Date.now() - startedAt;
      const sourceId = sourceIds[0] ?? schedule.id;

      const { data: runRow, error: runErr } = await supabase
        .from('report_schedule_runs')
        .insert({
          user_id: schedule.user_id,
          report_schedule_id: schedule.id,
          executed_at: now.toISOString(),
          trigger_type: 'scheduled',
          status: 'succeeded',
          execution_time_ms: executionTimeMs,
          result_summary: {
            type: 'diff',
            primary: primaryWindow,
            baseline: baselineWindow,
            tickets_moved: primaryCanonical.tickets_moved,
            tickets_completed: primaryCanonical.tickets_completed,
            prs_merged: primaryCanonical.prs_merged,
            repos_touched: primaryCanonical.repos_touched?.length ?? 0,
          },
        })
        .select('id')
        .single();

      if (runErr) {
        console.error('[runReportSchedule] insert run error', runErr);
        await supabase
          .from('report_schedules')
          .update({
            last_run_at: now.toISOString(),
            last_run_status: 'failed',
            last_run_error: runErr.message,
            updated_at: now.toISOString(),
          })
          .eq('id', schedule.id)
          .eq('user_id', schedule.user_id);
        return { status: 'failed', error: runErr.message };
      }

      await supabase
        .from('report_schedules')
        .update({
          last_run_at: now.toISOString(),
          last_run_status: 'succeeded',
          last_run_error: null,
          updated_at: now.toISOString(),
        })
        .eq('id', schedule.id)
        .eq('user_id', schedule.user_id);

      trackAutomationRun(supabase, schedule.user_id, {
        sourceId,
        triggerType: 'scheduled',
        status: 'succeeded',
        executionTimeMs,
        automationRuleId: schedule.id,
      }).catch((e) => console.warn('[runReportSchedule] track automation run failed', e));

      return { status: 'succeeded', runId: runRow?.id };
    }

    // type === 'projection': run AKU builder for schedule sources + audiences, optionally filter by units
    const sourceIds = Array.isArray(schedule.source_ids) ? schedule.source_ids : [];
    const audiences = Array.isArray(schedule.audiences) && schedule.audiences.length > 0
      ? schedule.audiences
      : ['Executive'];
    const units = Array.isArray(schedule.units) ? schedule.units : [];

    const { akus, projections } = await buildAkusForSources(
      supabase,
      schedule.user_id,
      sourceIds,
      audiences
    );

    const unitSet = units.length > 0 ? new Set(units.map((u) => u.trim().toLowerCase())) : null;
    const akusInScope = unitSet
      ? akus.filter((a) => unitSet.has((a.title || '').trim().toLowerCase()))
      : akus;
    const akuIdsInScope = new Set(akusInScope.map((a) => a.id));
    const projectionsInScope = projections.filter((p) => akuIdsInScope.has(p.aku_id));

    // KB delivery: push to Notion/Confluence if schedule has kb target configured
    const comm = schedule.communication || {};
    const kbEnabled = comm.kb === true;
    const kbProvider = comm.kb_provider === 'notion' || comm.kb_provider === 'confluence' ? comm.kb_provider : null;
    const kbResourceId = typeof comm.kb_resource_id === 'string' ? comm.kb_resource_id : null;
    if (kbEnabled && kbProvider && kbResourceId && akusInScope.length > 0) {
      try {
        const akusForPush = akusInScope.map((aku) => ({
          id: aku.id,
          title: aku.title || '',
          body: aku.body || '',
          audience_views: projectionsInScope
            .filter((p) => p.aku_id === aku.id)
            .map((p) => ({ audience: p.audience, projection: p.projection, status: p.status })),
        }));
        const plan = planKnowledgePush({
          akus: akusForPush,
          systemTitle: schedule.name || 'Knowledge',
          canonBaseUrl: process.env.NEXT_PUBLIC_APP_URL,
        });
        const existingRootResourceId =
          comm && typeof comm.kb_page_id === 'string' && comm.kb_page_id.trim().length ? comm.kb_page_id : null;

        const { rootPageId } = await runKnowledgePush({
          supabase,
          userId: schedule.user_id,
          provider: kbProvider,
          plan,
          rootResourceId: kbResourceId,
          rootMetadata: (comm.kb_root_metadata as Record<string, unknown>) || undefined,
          connectionId: (comm.kb_connection_id as string | null) || null,
          existingRootResourceId,
        });

        if (rootPageId && rootPageId !== existingRootResourceId) {
          const nextComm = { ...comm, kb_page_id: rootPageId };
          await supabase
            .from('report_schedules')
            .update({ communication: nextComm, updated_at: new Date().toISOString() })
            .eq('id', schedule.id)
            .eq('user_id', schedule.user_id);
        }
      } catch (kbErr) {
        const kbMessage = kbErr instanceof Error ? kbErr.message : String(kbErr);
        console.error('[runReportSchedule] KB push failed', kbErr);
        const executionTimeMs = Date.now() - startedAt;
        await supabase.from('report_schedule_runs').insert({
          user_id: schedule.user_id,
          report_schedule_id: schedule.id,
          executed_at: now.toISOString(),
          trigger_type: 'scheduled',
          status: 'failed',
          execution_time_ms: executionTimeMs,
          errors: [{ message: kbMessage }],
          result_summary: {
            type: 'projection',
            akus_count: akusInScope.length,
            projections_count: projectionsInScope.length,
            kb_push_error: kbMessage,
          },
        });
        await supabase
          .from('report_schedules')
          .update({
            last_run_at: now.toISOString(),
            last_run_status: 'failed',
            last_run_error: `KB push: ${kbMessage}`,
            updated_at: now.toISOString(),
          })
          .eq('id', schedule.id)
          .eq('user_id', schedule.user_id);
        const projKbSourceId = sourceIds[0] ?? schedule.id;
        trackAutomationRun(supabase, schedule.user_id, {
          sourceId: projKbSourceId,
          triggerType: 'scheduled',
          status: 'failed',
          executionTimeMs,
          automationRuleId: schedule.id,
          errors: [kbMessage],
        }).catch((e) => console.warn('[runReportSchedule] track automation run failed', e));
        return { status: 'failed', error: `KB push: ${kbMessage}` };
      }
    }

    const executionTimeMs = Date.now() - startedAt;
    const resultSummary = {
      type: 'projection',
      akus_count: akusInScope.length,
      projections_count: projectionsInScope.length,
      audiences,
      units_filter: units.length > 0 ? units : undefined,
    };

    const { data: runRow, error: runErr } = await supabase
      .from('report_schedule_runs')
      .insert({
        user_id: schedule.user_id,
        report_schedule_id: schedule.id,
        executed_at: now.toISOString(),
        trigger_type: 'scheduled',
        status: 'succeeded',
        execution_time_ms: executionTimeMs,
        result_summary: resultSummary,
      })
      .select('id')
      .single();

    if (runErr) {
      console.error('[runReportSchedule] insert run error (projection)', runErr);
      await supabase
        .from('report_schedules')
        .update({
          last_run_at: now.toISOString(),
          last_run_status: 'failed',
          last_run_error: runErr.message,
          updated_at: now.toISOString(),
        })
        .eq('id', schedule.id)
        .eq('user_id', schedule.user_id);
      return { status: 'failed', error: runErr.message };
    }

    await supabase
      .from('report_schedules')
      .update({
        last_run_at: now.toISOString(),
        last_run_status: 'succeeded',
        last_run_error: null,
        updated_at: now.toISOString(),
      })
      .eq('id', schedule.id)
      .eq('user_id', schedule.user_id);

    const projSourceId = sourceIds[0] ?? schedule.id;
    trackAutomationRun(supabase, schedule.user_id, {
      sourceId: projSourceId,
      triggerType: 'scheduled',
      status: 'succeeded',
      executionTimeMs,
      automationRuleId: schedule.id,
      documentsUpdated: projectionsInScope.length,
    }).catch((e) => console.warn('[runReportSchedule] track automation run failed', e));

    return { status: 'succeeded', runId: runRow?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[runReportSchedule] error', err);
    await supabase
      .from('report_schedules')
      .update({
        last_run_at: now.toISOString(),
        last_run_status: 'failed',
        last_run_error: message,
        updated_at: now.toISOString(),
      })
      .eq('id', schedule.id)
      .eq('user_id', schedule.user_id);

    await supabase.from('report_schedule_runs').insert({
      user_id: schedule.user_id,
      report_schedule_id: schedule.id,
      executed_at: now.toISOString(),
      trigger_type: 'scheduled',
      status: 'failed',
      execution_time_ms: Date.now() - startedAt,
      errors: [{ message }],
    });

    const failSourceId = (Array.isArray(schedule.source_ids) ? schedule.source_ids[0] : null) ?? schedule.id;
    trackAutomationRun(supabase, schedule.user_id, {
      sourceId: failSourceId,
      triggerType: 'scheduled',
      status: 'failed',
      executionTimeMs: Date.now() - startedAt,
      automationRuleId: schedule.id,
      errors: [message],
    }).catch((e) => console.warn('[runReportSchedule] track automation run failed', e));

    return { status: 'failed', error: message };
  }
}
