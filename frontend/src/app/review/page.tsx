import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Clock, GitCompare, Github } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type ReviewItem = {
  id: string;
  documentId: string;
  title: string;
  repoName: string;
  repoUrl: string;
  createdAt: string;
  changeSummary: string;
  affectedFiles: string[];
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export default async function ReviewQueuePage() {
  const { session, user } = await getSession();
  if (!session || !user) {
    redirect('/login');
  }

  const supabase = await createClient();

  const { data: repos } = await supabase
    .from('workspace_sources')
    .select('id, name, repo_url, external_url, provider')
    .eq('user_id', user.id);

  const repoIds = (repos || []).map(repo => repo.id);
  const repoMap = new Map((repos || []).map(repo => [repo.id, repo]));

  const { data: documents } = repoIds.length > 0
    ? await supabase
      .from('documents')
      .select('id, title, source_id')
      .in('source_id', repoIds)
    : { data: [] };

  const documentIds = (documents || []).map(doc => doc.id);
  const documentMap = new Map((documents || []).map(doc => [doc.id, doc]));

  const buildReviewItem = (version: {
    id: string;
    document_id: string;
    version_number?: number;
    content?: string;
    change_summary?: string;
    status?: string;
    metadata?: Record<string, unknown>;
    created_at: string;
    [key: string]: unknown;
  }, fallbackSummary: string): ReviewItem | null => {
    const document = documentMap.get(version.document_id);
    if (!document) return null;
    const sourceId = document.source_id;
    const repo = repoMap.get(sourceId);
    const metadata = version.metadata || {};
    const affectedFiles = Array.isArray(metadata.affected_files)
      ? metadata.affected_files
      : Array.isArray(metadata.updated_files)
        ? metadata.updated_files
        : [];

    return {
      id: version.id,
      documentId: version.document_id,
      title: document.title || 'Untitled',
      repoName: repo?.name || 'Unknown repo',
      repoUrl: repo?.repo_url || repo?.external_url || '',
      createdAt: version.created_at,
      changeSummary: version.change_summary || fallbackSummary,
      affectedFiles,
    };
  };

  const { data: pendingVersions } = documentIds.length > 0
    ? await supabase
      .from('document_versions')
      .select('id, document_id, created_at, change_summary, metadata')
      .in('document_id', documentIds)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    : { data: [] };

  const { data: rejectedVersions } = documentIds.length > 0
    ? await supabase
      .from('document_versions')
      .select('id, document_id, created_at, change_summary, metadata')
      .in('document_id', documentIds)
      .eq('status', 'rejected')
      .order('created_at', { ascending: false })
    : { data: [] };

  const pendingItems = (pendingVersions || [])
    .map((version: {
      id: string;
      document_id: string;
      version_number?: number;
      content?: string;
      change_summary?: string;
      status?: string;
      metadata?: Record<string, unknown>;
      created_at: string;
      [key: string]: unknown;
    }) => buildReviewItem(version, 'Automated update pending review'))
    .filter(Boolean) as ReviewItem[];

  const rejectedItems = (rejectedVersions || [])
    .map((version: {
      id: string;
      document_id: string;
      version_number?: number;
      content?: string;
      change_summary?: string;
      status?: string;
      metadata?: Record<string, unknown>;
      created_at: string;
      [key: string]: unknown;
    }) => buildReviewItem(version, 'Previously rejected update'))
    .filter(Boolean) as ReviewItem[];

  const hasPending = pendingItems.length > 0;
  const hasRejected = rejectedItems.length > 0;
  const hasAny = hasPending || hasRejected;

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <Card className="border border-white/10 bg-gradient-to-b from-white/5 to-white/0 shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <div className="inline-flex items-center gap-2 text-white/80">
              <GitCompare className="h-5 w-5" />
              <CardTitle className="text-2xl font-semibold text-white">Review</CardTitle>
            </div>
            <CardDescription className="text-white/70">
              Approve or reject automated documentation updates before they replace live content. Rejected updates stay available for later review.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-white/60">
              {pendingItems.length} pending / {rejectedItems.length} rejected
            </div>
          </CardContent>
        </Card>

        {!hasAny ? (
          <Card className="border border-white/10 bg-white/5">
            <CardContent className="p-8 text-center text-white/70">
              <p>No pending reviews right now.</p>
              <div className="mt-4">
                <Button asChild>
                  <Link href="/knowledge">Generate Documentation</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Pending reviews</h2>
                <span className="text-sm text-white/60">{pendingItems.length}</span>
              </div>
              {!hasPending ? (
                <Card className="border border-white/10 bg-white/5">
                  <CardContent className="p-6 text-center text-white/70">
                    <p>No pending reviews right now.</p>
                    <div className="mt-4">
                      <Button asChild>
                        <Link href="/knowledge">Generate Documentation</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {pendingItems.map((item) => {
                    const reviewHref = `/review/${item.documentId}?review=${encodeURIComponent(item.id)}`;
                    return (
                      <Card key={item.id} className="border border-white/10 bg-white/5">
                        <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
                          <div className="space-y-2">
                            <div className="text-lg font-semibold text-white">{item.title}</div>
                            <div className="flex flex-wrap items-center gap-3 text-sm text-white/60">
                              <div className="flex items-center gap-2">
                                <Github className="h-4 w-4 text-white/50" />
                                <span>{item.repoUrl ? item.repoUrl.replace('https://github.com/', '') : item.repoName}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-white/50" />
                                <span>{formatDate(item.createdAt)}</span>
                              </div>
                            </div>
                            <p className="text-sm text-white/70">{item.changeSummary}</p>
                            {item.affectedFiles.length > 0 && (
                              <div className="text-xs text-white/50">
                                {item.affectedFiles.length} file{item.affectedFiles.length === 1 ? '' : 's'} changed
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-3">
                            <Button asChild variant="secondary">
                              <Link href={reviewHref}>Review</Link>
                            </Button>
                            <Button asChild variant="ghost">
                              <Link href={`/edit/${item.documentId}`}>Open Document</Link>
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Rejected updates</h2>
                <span className="text-sm text-white/60">{rejectedItems.length}</span>
              </div>
              {!hasRejected ? (
                <Card className="border border-white/10 bg-white/5">
                  <CardContent className="p-6 text-center text-white/70">
                    <p>No rejected updates.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {rejectedItems.map((item) => {
                    const reviewHref = `/review/${item.documentId}?review=${encodeURIComponent(item.id)}`;
                    return (
                      <Card key={item.id} className="border border-white/10 bg-white/5">
                        <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2 text-lg font-semibold text-white">
                              <span>{item.title}</span>
                              <span className="rounded-full border border-red-400/30 bg-red-500/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-red-200">
                                Rejected
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-sm text-white/60">
                              <div className="flex items-center gap-2">
                                <Github className="h-4 w-4 text-white/50" />
                                <span>{item.repoUrl ? item.repoUrl.replace('https://github.com/', '') : item.repoName}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-white/50" />
                                <span>{formatDate(item.createdAt)}</span>
                              </div>
                            </div>
                            <p className="text-sm text-white/70">{item.changeSummary}</p>
                            {item.affectedFiles.length > 0 && (
                              <div className="text-xs text-white/50">
                                {item.affectedFiles.length} file{item.affectedFiles.length === 1 ? '' : 's'} changed
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-3">
                            <Button asChild variant="secondary">
                              <Link href={reviewHref}>Review Again</Link>
                            </Button>
                            <Button asChild variant="ghost">
                              <Link href={`/edit/${item.documentId}`}>Open Document</Link>
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
