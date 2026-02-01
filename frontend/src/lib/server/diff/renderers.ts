import type { CanonDiff } from './canon';

type Audience = 'eng' | 'gtm' | 'customers';

type RenderOptions = {
  audiences?: Audience[];
  title?: string;
};

/** Human-readable date range for diff windows (e.g. KB export and scheduled reports). */
export function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start).toISOString().replace('T', ' ').slice(0, 16);
  const endDate = new Date(end).toISOString().replace('T', ' ').slice(0, 16);
  return `${startDate} → ${endDate} UTC`;
}

function sectionHeader(title: string): string {
  return `## ${title}`;
}

function summarizeList(
  label: string,
  items: Array<{ ticket_id?: string; pr_number?: number | null }>,
  limit = 10
): string {
  if (items.length === 0) return `- ${label}: none\n`;
  const seen = new Set<string>();
  const deduped = items.filter((item) => {
    const key = item.pr_number ? `pr:${item.pr_number}` : item.ticket_id ? `ticket:${item.ticket_id}` : '';
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const lines = deduped.slice(0, limit).map((item) => {
    if (item.pr_number) {
      return `  - PR #${item.pr_number}`;
    }
    if (item.ticket_id) {
      return `  - ${item.ticket_id}`;
    }
    return '  - Update';
  });
  const more = deduped.length > limit ? `  - …and ${deduped.length - limit} more` : '';
  return `- ${label} (${deduped.length}):\n${lines.join('\n')}${more ? `\n${more}` : ''}\n`;
}

function renderEng(diff: CanonDiff): string {
  return [
    sectionHeader('Engineering (Runbooks / Dependencies)'),
    summarizeList('PRs merged', diff.prs_merged),
    summarizeList('PRs opened', diff.prs_opened),
    summarizeList('Tickets moved', diff.tickets_moved),
    summarizeList('Tickets completed', diff.tickets_completed),
    summarizeList('Tickets regressed', diff.tickets_regressed),
    summarizeList('PRs closed without merge', diff.prs_closed_unmerged),
  ].join('\n');
}

function renderGtm(diff: CanonDiff): string {
  return [
    sectionHeader('GTM (Launch Notes)'),
    `- Releases shipped: ${diff.prs_merged.length}`,
    `- Active work started: ${diff.prs_opened.length}`,
    `- Tickets completed: ${diff.tickets_completed.length}`,
    `- Tickets moved: ${diff.tickets_moved.length}`,
  ].join('\n');
}

function renderCustomers(diff: CanonDiff): string {
  return [
    sectionHeader('Customers (What Changed)'),
    `- Updates shipped: ${diff.prs_merged.length}`,
    `- Improvements in progress: ${diff.prs_opened.length}`,
    `- Tickets completed: ${diff.tickets_completed.length}`,
    `- Tickets moved: ${diff.tickets_moved.length}`,
  ].join('\n');
}

export function renderDiffMarkdown(
  diff: CanonDiff,
  options: RenderOptions = {}
): string {
  const audiences = options.audiences?.length ? options.audiences : ['eng', 'gtm', 'customers'];
  const header = `# ${options.title || 'Daily Activity Diff'}\n\n` +
    `**Repos:** ${diff.repos_touched.length ? diff.repos_touched.join(', ') : '—'}\n` +
    `**Window:** ${formatDateRange(diff.start, diff.end)}\n`;

  const sections = audiences.map((audience) => {
    switch (audience) {
      case 'eng':
        return renderEng(diff);
      case 'gtm':
        return renderGtm(diff);
      case 'customers':
        return renderCustomers(diff);
      default:
        return '';
    }
  }).filter(Boolean);

  return [header, ...sections].join('\n\n');
}
