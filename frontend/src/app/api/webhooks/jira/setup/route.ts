import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOrCreateJiraWebhookSecret } from '@/lib/server/jira/webhookSecret';
import { listJiraSitesForUser } from '@/lib/server/jira/sites';
import { listJiraProjectsForUser } from '@/lib/server/jira/projects';

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    return parsed.origin;
  } catch {
    return '';
  }
}

function resolveBaseUrl(request: NextRequest): string {
  const configured = process.env.CANON_WEBHOOK_BASE_URL;
  if (typeof configured === 'string') {
    const normalized = normalizeBaseUrl(configured);
    if (normalized) return normalized;
  }

  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  const protocol = request.headers.get('x-forwarded-proto') || 'https';
  if (host) {
    return `${protocol}://${host}`;
  }

  return '';
}

function buildJql(projectKeys: string[]): string {
  if (projectKeys.length === 0) return '';
  const normalized = Array.from(
    new Set(projectKeys.map((k) => k.trim().toUpperCase()).filter((k) => k.length > 0))
  ).sort((a, b) => a.localeCompare(b));
  if (normalized.length === 0) return '';
  return `project in (${normalized.join(', ')})`;
}

const JIRA_WEBHOOK_SCOPES = [
  'Issue: created',
  'Issue: updated',
];

export async function GET(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { webhookToken, secretPlaintext } = await getOrCreateJiraWebhookSecret(user.id);
    const baseUrl = resolveBaseUrl(request);
    const webhookPath = `/api/webhooks/jira?t=${encodeURIComponent(webhookToken)}`;
    const webhookUrl = baseUrl ? `${baseUrl}${webhookPath}` : webhookPath;

    const sites = await listJiraSitesForUser(user.id);
    const sitesWithJql: Array<{
      id: string;
      name: string;
      url: string;
      projectKeys: string[];
      jql: string;
    }> = [];

    for (const site of sites) {
      const { projects } = await listJiraProjectsForUser(user.id, site.id);
      const projectKeys = projects.map((p) => p.key).filter(Boolean);
      const jql = buildJql(projectKeys);
      sitesWithJql.push({
        id: site.id,
        name: site.name,
        url: site.url,
        projectKeys: [...new Set(projectKeys)].sort((a, b) => a.localeCompare(b)),
        jql,
      });
    }

    return NextResponse.json(
      {
        webhookUrl,
        webhookSecret: secretPlaintext,
        scopes: JIRA_WEBHOOK_SCOPES,
        sites: sitesWithJql,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error: 'Failed to load Jira webhook setup',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
