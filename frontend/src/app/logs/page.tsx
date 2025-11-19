import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { LogsPageClient } from './page-client';

export default async function LogsPage() {
  const { session, user } = await getSession();

  if (!session) {
    redirect('/login');
  }

  const supabase = await createClient();

  // Get all submissions with their status history
  const { data: submissions, error: submissionsError } = await supabase
    .from('submissions')
    .select('id, created_at, status, error_message, title, input_type, last_checked_at, is_outdated')
    .order('created_at', { ascending: false })
    .limit(100);

  // Get architecture diagram updates
  const { data: diagrams, error: diagramsError } = await supabase
    .from('architecture_diagrams')
    .select('id, created_at, last_updated_at, title, repo_url')
    .order('last_updated_at', { ascending: false })
    .limit(50);

  // Get architecture diagram versions
  const { data: versions, error: versionsError } = await supabase
    .from('architecture_diagram_versions')
    .select('id, created_at, diagram_id, version_number, change_summary')
    .order('created_at', { ascending: false })
    .limit(50);

  // Build activity log entries
  const logEntries: Array<{
    id: string;
    type: 'document' | 'document_error' | 'architecture' | 'architecture_version';
    timestamp: string;
    title: string;
    message: string;
    status?: string;
    link?: string;
  }> = [];

  // Add submission entries
  submissions?.forEach((sub) => {
    logEntries.push({
      id: sub.id,
      type: sub.error_message ? 'document_error' : 'document',
      timestamp: sub.created_at,
      title: sub.title || 'Untitled Document',
      message: sub.error_message || `Document ${sub.status === 'completed' ? 'completed' : sub.status}`,
      status: sub.status,
      link: `/edit/${sub.id}`,
    });

    // Add regeneration entry if updated
    if (sub.last_checked_at && sub.last_checked_at !== sub.created_at) {
      logEntries.push({
        id: `${sub.id}-regenerated`,
        type: 'document',
        timestamp: sub.last_checked_at,
        title: sub.title || 'Untitled Document',
        message: 'Document regenerated',
        status: sub.status,
        link: `/edit/${sub.id}`,
      });
    }
  });

  // Add architecture diagram entries
  diagrams?.forEach((diag) => {
    if (diag.last_updated_at !== diag.created_at) {
      logEntries.push({
        id: diag.id,
        type: 'architecture',
        timestamp: diag.last_updated_at,
        title: diag.title,
        message: 'Architecture diagram updated',
        link: `/architecture/${diag.id}`,
      });
    }
  });

  // Add version entries
  versions?.forEach((version) => {
    logEntries.push({
      id: version.id,
      type: 'architecture_version',
      timestamp: version.created_at,
      title: `Version ${version.version_number}`,
      message: version.change_summary || 'New version created',
      link: `/architecture/${version.diagram_id}`,
    });
  });

  // Sort by timestamp (most recent first)
  logEntries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const logs = {
    entries: logEntries.slice(0, 100), // Limit to 100 most recent
    errors: {
      submissions: submissionsError?.message,
      diagrams: diagramsError?.message,
      versions: versionsError?.message,
    },
  };

  return (
    <LogsPageClient
      user={user}
      logs={logs}
    />
  );
}

