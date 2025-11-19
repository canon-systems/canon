/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE
 * - GitHub webhook endpoint to receive push events
 * - Automatically marks affected submissions as outdated when code changes
 * - Uses provider abstraction for future multi-provider support
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRepoProvider } from '@/lib/server/repos/providerFactory';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';

/**
 * Verify GitHub webhook signature
 */
function verifyGitHubSignature(payload: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;

  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const rawBody = await request.text();
    const payload = JSON.parse(rawBody);
    const event = request.headers.get('x-github-event');

    // Verify webhook signature if secret is configured
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = request.headers.get('x-hub-signature-256');
      if (!signature || !verifyGitHubSignature(rawBody, signature, webhookSecret)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    // Only handle push events
    if (event !== 'push') {
      return NextResponse.json({ message: 'Event ignored', event });
    }

    // Use provider abstraction to handle webhook
    const provider = getRepoProvider(payload.repository?.html_url || '');
    if (!provider) {
      return NextResponse.json({ error: 'Unsupported repository provider' }, { status: 400 });
    }

    const webhookResult = provider.handleWebhook(payload);
    if (!webhookResult) {
      return NextResponse.json({ error: 'Failed to process webhook payload' }, { status: 400 });
    }

    const { repoUrl, branch, changedFiles: webhookChangedFiles, latestCommitSha } = webhookResult;

    // Find affected submissions for this repo/branch
    const supabase = await createClient();
    const { data: submissions } = await supabase
      .from('submissions')
      .select('id, source_meta, selected_files, code_snapshot')
      .in('input_type', ['github_repo', 'github_repo_directory'])
      .eq('status', 'completed');

    if (!submissions || submissions.length === 0) {
      return NextResponse.json({ message: 'No submissions to check' });
    }

    // Filter submissions for this repo/branch
    const affected = submissions.filter((sub: any) => {
      const meta = sub.source_meta;
      return meta?.repoUrl === repoUrl && meta?.branch === branch;
    });

    if (affected.length === 0) {
      return NextResponse.json({ message: 'No affected documents found' });
    }

    // Mark submissions as outdated if their tracked files changed
    const changedFilesSet = new Set(webhookChangedFiles);
    const markedOutdated: string[] = [];

    for (const sub of affected) {
      const selectedFiles = sub.selected_files || [];
      const hasChangedFile = selectedFiles.some((file: string) => changedFilesSet.has(file));

      // Also check if branch commit changed
      const codeSnapshot = sub.code_snapshot || {};
      const storedCommitSha = codeSnapshot.commitSha;

      // Mark as outdated if:
      // 1. Any tracked file was changed, OR
      // 2. Commit SHA changed (even if we don't know which files)
      if (hasChangedFile || (storedCommitSha && storedCommitSha !== latestCommitSha)) {
        await supabase
          .from('submissions')
          .update({
            is_outdated: true,
            last_checked_at: new Date().toISOString()
          })
          .eq('id', sub.id);

        markedOutdated.push(sub.id);
      }
    }

    return NextResponse.json({
      message: 'Webhook processed',
      repoUrl,
      branch,
      affectedCount: affected.length,
      markedOutdatedCount: markedOutdated.length,
      markedOutdated
    });
  } catch (err: any) {
    console.error('Webhook error:', err);
    return NextResponse.json(
      { error: 'Webhook processing failed', detail: err.message || String(err) },
      { status: 500 }
    );
  }
}

