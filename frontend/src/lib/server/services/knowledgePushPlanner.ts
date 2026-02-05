/**
 * Knowledge Base push planner
 * ---------------------------
 * Builds a deterministic tree describing what to publish to an external KB.
 * Structure:
 *   - System page (root)
 *   - One AKU page per AKU (child of system)
 *   - One audience page per audience view (child of its AKU)
 *
 * Notes:
 * - Canonical AKU content stays in Canon; KB only gets audience projections plus links back.
 * - Each page includes a “Managed by Canon” banner and a link back to the Canon AKU.
 * - A hash of the rendered markdown is included so callers can skip unchanged pages.
 */

import * as crypto from 'crypto';

type AudienceView = {
  audience: string;
  projection: string;
  status?: string;
};

export type Aku = {
  id: string;
  title: string;
  body: string;
  audience_views?: AudienceView[];
};

export type PlannedPage = {
  key: string; // Stable local key (not provider id)
  parentKey: string | null;
  title: string;
  markdown: string;
  type: 'system' | 'aku' | 'audience';
  akuId: string | null;
  audience: string | null;
  hash: string; // SHA-256 of markdown
};

export type PlanResult = {
  systemPage: PlannedPage;
  akuPages: PlannedPage[];
  audiencePages: PlannedPage[];
  pages: PlannedPage[];
};

const MANAGED_BANNER = '> Managed by Canon';

/**
 * Create a single-page plan (e.g. for diff reports) to push to a KB root.
 * The page is created as a system-type page under the given root.
 */
export function createSinglePagePlan(title: string, markdown: string): PlanResult {
  const withBanner = [markdown.trim(), '', MANAGED_BANNER].join('\n');
  const systemPage: PlannedPage = {
    key: 'system',
    parentKey: null,
    title,
    markdown: withBanner,
    type: 'system',
    akuId: null,
    audience: null,
    hash: hash(withBanner),
  };
  return {
    systemPage,
    akuPages: [],
    audiencePages: [],
    pages: [systemPage],
  };
}

const slug = (text: string) =>
  (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const hash = (markdown: string) => crypto.createHash('sha256').update(markdown, 'utf8').digest('hex');

function normalizeProjectionMarkdown(input: string): string {
  const raw = (input || '').trim();
  if (!raw) return '';
  const pendingMatch = raw.match(/^PENDING:\s*([\s\S]*?)(?:\n{2,}|\n)([\s\S]*)$/i);
  const body = (pendingMatch?.[2] || raw).trim();

  const blocks = body.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const sections: Array<{ label: string; text: string }> = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const first = (lines[0] || '').trim();
    const headerOnly = first.match(/^([A-Za-z][A-Za-z0-9 /&-]{1,80}):\s*$/);
    if (headerOnly) {
      sections.push({ label: headerOnly[1], text: lines.slice(1).join('\n').trim() });
      continue;
    }
    const inline = block.match(/^([A-Za-z][A-Za-z0-9 /&-]{1,80}):\s+([\s\S]+)$/);
    if (inline) {
      sections.push({ label: inline[1], text: inline[2].trim() });
    }
  }

  if (sections.length === 0) return body;
  return sections
    .map((s) => `## ${s.label}\n\n${s.text}`.trim())
    .join('\n\n');
}

/**
 * Build the knowledge base publishing plan.
 */
export function planKnowledgePush(params: {
  akus: Aku[];
  systemTitle?: string;
  canonBaseUrl?: string;
}): PlanResult {
  const { akus, systemTitle = 'System Knowledge' } = params;
  const safeAkus = Array.isArray(akus) ? akus : [];

  // System page: no title in body (Confluence/Notion set page title); only projections, no AKU list
  const systemLines = [
    MANAGED_BANNER,
    '',
    'This space lists audience projections from Canon.',
  ];

  const systemMarkdown = systemLines.join('\n');
  const systemPage: PlannedPage = {
    key: 'system',
    parentKey: null,
    title: systemTitle,
    markdown: systemMarkdown,
    type: 'system',
    akuId: null,
    audience: null,
    hash: hash(systemMarkdown),
  };

  const akuPages: PlannedPage[] = [];
  const audiencePages: PlannedPage[] = [];

  safeAkus.forEach((aku) => {
    const audiences = Array.isArray(aku.audience_views)
      ? aku.audience_views.filter((v) => v?.audience && v?.projection)
      : [];

    // AKU page: no title in body, no AKU links or audience list — only structural for navigation; content is on projection pages
    const akuMarkdown = [MANAGED_BANNER].join('\n');

    const akuPage: PlannedPage = {
      key: `aku:${aku.id}`,
      parentKey: systemPage.key,
      title: aku.title,
      markdown: akuMarkdown,
      type: 'aku',
      akuId: aku.id,
      audience: null,
      hash: hash(akuMarkdown),
    };

    akuPages.push(akuPage);

    audiences.forEach((view) => {
      const audienceTitle = `${aku.title} – ${view.audience}`;
      // Projection page: no title in body, no Canon AKU link — only audience label and projection content
      const audienceMarkdown = [
        MANAGED_BANNER,
        '',
        `Audience: ${view.audience}`,
        '',
        normalizeProjectionMarkdown(view.projection),
      ].join('\n');

      audiencePages.push({
        key: `aud:${aku.id}:${slug(view.audience) || 'aud'}`,
        parentKey: akuPage.key,
        title: audienceTitle,
        markdown: audienceMarkdown,
        type: 'audience',
        akuId: aku.id,
        audience: view.audience,
        hash: hash(audienceMarkdown),
      });
    });
  });

  return {
    systemPage,
    akuPages,
    audiencePages,
    pages: [systemPage, ...akuPages, ...audiencePages],
  };
}

// Convenience: quick preview formatter (useful for tests or logging)
export function formatPlanSummary(plan: PlanResult): string {
  const lines: string[] = [];
  lines.push(`System: ${plan.systemPage.title}`);
  plan.akuPages.forEach((a) => {
    lines.push(`- AKU: ${a.title}`);
    plan.audiencePages
      .filter((p) => p.parentKey === a.key)
      .forEach((aud) => lines.push(`  - Audience: ${aud.title}`));
  });
  return lines.join('\n');
}

// CommonJS interop for node -e tests
module.exports = { planKnowledgePush, formatPlanSummary };
