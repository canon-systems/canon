'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, XCircle, Clock, ArrowLeft } from 'lucide-react';
import { RegeneratePreview } from '@/components/RegeneratePreview';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type PendingReview = {
  id: string;
  content: string;
  createdAt: string;
  model: string;
  changeSummary: string;
  affectedFiles: string[];
};

interface ReviewPageClientProps {
  documentId: string;
  title: string;
  currentContent: string;
  pending: PendingReview | null;
}

export function ReviewPageClient({ documentId, title, currentContent, pending }: ReviewPageClientProps) {
  const router = useRouter();
  const [saving, setSaving] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState('');

  async function handleReview(action: 'approve' | 'reject') {
    if (!pending) return;
    setSaving(action);
    setError('');

    try {
      const res = await fetch('/api/docs/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          documentId,
          requestId: pending.id,
          action,
        }),
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(result?.error || result?.detail || `Review failed (${res.status})`);
      }

      router.push(`/edit/${documentId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to process review');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Link href={`/edit/${documentId}`} className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white">
              <ArrowLeft className="h-4 w-4" />
              Back to document
            </Link>
            <h1 className="mt-2 text-2xl font-semibold text-white">Review Update</h1>
            <p className="text-sm text-white/60">
              {title}
            </p>
          </div>
          {pending && (
            <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-white/50" />
                <span>Generated {new Date(pending.createdAt).toLocaleString()}</span>
              </div>
              {pending.model && (
                <div className="mt-1 text-xs text-white/50">Model: {pending.model}</div>
              )}
            </div>
          )}
        </div>

        {!pending ? (
          <Card>
            <CardHeader>
              <CardTitle>No pending updates</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-white/70">This document does not have any pending automated updates.</p>
              <div className="mt-4">
                <Button asChild>
                  <Link href={`/edit/${documentId}`}>Return to document</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {pending.changeSummary && (
              <Alert>
                <AlertDescription>{pending.changeSummary}</AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Card className="border border-white/10 bg-white/5">
              <CardContent className="p-4">
                <RegeneratePreview originalText={currentContent} newText={pending.content} />
              </CardContent>
            </Card>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => handleReview('approve')}
                disabled={saving !== null}
                className="inline-flex items-center gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                {saving === 'approve' ? 'Applying...' : 'Approve & Apply'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleReview('reject')}
                disabled={saving !== null}
                className="inline-flex items-center gap-2"
              >
                <XCircle className="h-4 w-4" />
                {saving === 'reject' ? 'Rejecting...' : 'Reject Update'}
              </Button>
              <div className="text-sm text-white/50">
                Review required before changes are applied.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
