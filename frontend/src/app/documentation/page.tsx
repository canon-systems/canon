import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { DocumentationPageClient } from './page-generate-client';

interface PageProps {
  searchParams: Promise<{
    repoId?: string;
  }>;
}

export default async function DocumentationPage({ searchParams }: PageProps) {
  const { session } = await getSession();

  if (!session) {
    redirect('/login');
  }

  const resolvedParams = await searchParams;
  return <DocumentationPageClient repoId={resolvedParams.repoId} />;
}

