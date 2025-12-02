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

    // Find affected documents for this repo/branch
    const supabase = await createClient();
    
    // Get repos matching this URL
    const { data: repos } = await supabase
      .from('workspace_repos')
      .select('id, repo_url, default_branch')
      .eq('repo_url', repoUrl)
      .eq('default_branch', branch);

    if (!repos || repos.length === 0) {
      return NextResponse.json({ message: 'No repositories found for this webhook' });
    }

    const repoIds = repos.map(r => r.id);

    // Get documents for these repos
    const { data: documents } = await supabase
      .from('documents')
      .select('id, repo_id')
      .in('repo_id', repoIds);

    if (!documents || documents.length === 0) {
      return NextResponse.json({ message: 'No documents found for this repository' });
    }

    // Get tracked files for these documents
    const documentIds = documents.map(d => d.id);
    const { data: documentFiles } = await supabase
      .from('document_files')
      .select('document_id, file_path')
      .in('document_id', documentIds);

    // Group files by document
    const filesByDocument = new Map<string, string[]>();
    documentFiles?.forEach(df => {
      const files = filesByDocument.get(df.document_id) || [];
      files.push(df.file_path);
      filesByDocument.set(df.document_id, files);
    });

    // Mark documents as needing update if their tracked files changed
    const changedFilesSet = new Set(webhookChangedFiles);
    const markedForUpdate: string[] = [];

    for (const doc of documents) {
      const trackedFiles = filesByDocument.get(doc.id) || [];
      const hasChangedFile = trackedFiles.some((file: string) => changedFilesSet.has(file));

      // Note: In the new schema, documents don't have is_outdated field
      // This would need to be handled differently (e.g., via a separate tracking table)
      // For now, we'll just track which documents need updating
      if (hasChangedFile) {
        markedForUpdate.push(doc.id);
      }
    }

    return NextResponse.json({
      message: 'Webhook processed',
      repoUrl,
      branch,
      affectedCount: documents.length,
      markedForUpdateCount: markedForUpdate.length,
      markedForUpdate
    });
  } catch (err: any) {
    console.error('Webhook error:', err);
    return NextResponse.json(
      { error: 'Webhook processing failed', detail: err.message || String(err) },
      { status: 500 }
    );
  }
}

