import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { OverviewPageClient } from './page-client';

export default async function OverviewPage() {
  const { session, user } = await getSession();

  if (!session) {
    redirect('/login');
  }

  const supabase = await createClient();

  // Get total documents generated (completed submissions)
  const { data: submissions, error: submissionsError } = await supabase
    .from('submissions')
    .select('id, created_at, status, last_checked_at')
    .eq('status', 'completed');

  // Get total architecture diagrams
  const { data: diagrams, error: diagramsError } = await supabase
    .from('architecture_diagrams')
    .select('id, created_at, last_updated_at');

  // Get architecture diagram versions (for regeneration count)
  const { data: versions, error: versionsError } = await supabase
    .from('architecture_diagram_versions')
    .select('id, created_at, diagram_id')
    .order('created_at', { ascending: false });

  const stats = {
    totalDocuments: submissions?.length || 0,
    totalRegenerated: 0, // Will be calculated client-side
    totalArchitectureDiagrams: diagrams?.length || 0,
    totalArchitectureVersions: versions?.length || 0,
    rawData: {
      submissions: submissions?.map((sub) => ({
        created_at: sub.created_at,
        last_checked_at: sub.last_checked_at,
      })) || [],
      diagrams: diagrams?.map((diag) => ({
        created_at: diag.created_at,
      })) || [],
      versions: versions?.map((version) => ({
        created_at: version.created_at,
      })) || [],
    },
    errors: {
      submissions: submissionsError?.message,
      diagrams: diagramsError?.message,
      versions: versionsError?.message,
    },
  };

  return (
    <OverviewPageClient
      user={user}
      stats={stats}
    />
  );
}

