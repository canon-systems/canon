import { NextRequest } from 'next/server';
import { handleJiraWebhook } from '@/lib/server/diff/jiraWebhookHandler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  return handleJiraWebhook(request);
}
