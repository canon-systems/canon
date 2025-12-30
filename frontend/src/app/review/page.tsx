import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Clock, GitCompare, Github } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type PendingItem = {
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
    .from('workspace_repos')
    .select('id, name, repo_url')
    .eq('user_id', user.id);

  const repoIds = (repos || []).map(repo => repo.id);
  const repoMap = new Map((repos || []).map(repo => [repo.id, repo]));

  const { data: documents } = repoIds.length > 0
    ? await supabase
        .from('documents')
        .select('id, title, repo_id')
        .in('repo_id', repoIds)
    : { data: [] };

  const documentIds = (documents || []).map(doc => doc.id);
  const documentMap = new Map((documents || []).map(doc => [doc.id, doc]));

  const { data: pendingVersions } = documentIds.length > 0
    ? await supabase
        .from('document_versions')
        .select('id, document_id, created_at, change_summary, metadata')
        .in('document_id', documentIds)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
    : { data: [] };

  const pendingItems: PendingItem[] = (pendingVersions || [])
    .map((version: any) => {
      const document = documentMap.get(version.document_id);
      if (!document) return null;
      const repo = repoMap.get(document.repo_id);
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
        repoUrl: repo?.repo_url || '',
        createdAt: version.created_at,
        changeSummary: version.change_summary || 'Automated update pending review',
        affectedFiles,
      };
    })
    .filter(Boolean) as PendingItem[];

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <Card className="border border-white/10 bg-gradient-to-b from-white/5 to-white/0 shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <div className="inline-flex items-center gap-2 text-white/80">
              <GitCompare className="h-5 w-5" />
              <CardTitle className="text-2xl font-semibold text-white">Review Queue</CardTitle>
            </div>
            <CardDescription className="text-white/70">
              Approve or reject automated documentation updates before they replace live content.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-white/60">
              {pendingItems.length} item{pendingItems.length === 1 ? '' : 's'} waiting for review
            </div>
          </CardContent>
        </Card>

        {pendingItems.length === 0 ? (
          <Card className="border border-white/10 bg-white/5">
            <CardContent className="p-8 text-center text-white/70">
              <p>No pending reviews right now.</p>
              <div className="mt-4">
                <Button asChild>
                  <Link href="/documentation">Generate Documentation</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {pendingItems.map((item) => (
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
                      <Link href={`/review/${item.documentId}`}>Review</Link>
                    </Button>
                    <Button asChild variant="ghost">
                      <Link href={`/edit/${item.documentId}`}>Open Document</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
