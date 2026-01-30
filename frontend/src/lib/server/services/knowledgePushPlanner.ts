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

const MANAGED_BANNER = '> Managed by Canon — source of truth lives inside Canon.';

const slug = (text: string) =>
  (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const hash = (markdown: string) => crypto.createHash('sha256').update(markdown, 'utf8').digest('hex');

/**
 * Build the knowledge base publishing plan.
 */
export function planKnowledgePush(params: {
  akus: Aku[];
  systemTitle?: string;
  canonBaseUrl?: string;
}): PlanResult {
  const { akus, systemTitle = 'System Knowledge', canonBaseUrl = 'https://canon.internal' } = params;
  const safeAkus = Array.isArray(akus) ? akus : [];

  // System page
  const systemLines = [
    `# ${systemTitle}`,
    MANAGED_BANNER,
    '',
    'This space lists Audience Knowledge Units (AKUs) managed inside Canon.',
    '',
    '## AKUs',
  ];

  safeAkus.forEach((aku) => {
    const canonLink = `${canonBaseUrl}/akus/${aku.id}`;
    systemLines.push(`- ${aku.title} — Canon source: ${canonLink}`);
  });

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
    const canonLink = `${canonBaseUrl}/akus/${aku.id}`;
    const audiences = Array.isArray(aku.audience_views)
      ? aku.audience_views.filter((v) => v?.audience && v?.projection)
      : [];
    const audienceList = audiences.map((v) => `- ${aku.title} – ${v.audience}`).join('\n');

    const akuMarkdown = [
      `# ${aku.title}`,
      MANAGED_BANNER,
      '',
      `Canonical AKU: ${canonLink}`,
      '',
      audiences.length ? 'Audience views:' : 'No audience projections available.',
      audienceList,
    ]
      .filter(Boolean)
      .join('\n');

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
      const audienceMarkdown = [
        `# ${audienceTitle}`,
        MANAGED_BANNER,
        '',
        `Audience: ${view.audience}`,
        `Canon AKU: ${canonLink}`,
        '',
        view.projection.trim(),
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
