import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { DocumentationPageClient } from './page-generate-client';

export default async function DocumentationPage() {
  const { session } = await getSession();

  if (!session) {
    redirect('/login');
  }

  return <DocumentationPageClient />;
}

