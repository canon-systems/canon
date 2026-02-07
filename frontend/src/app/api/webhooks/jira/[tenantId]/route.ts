import { NextRequest } from 'next/server';
import { handleJiraWebhook } from '@/lib/server/diff/jiraWebhookHandler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest, context: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await context.params;
  return handleJiraWebhook(request, tenantId);
}
