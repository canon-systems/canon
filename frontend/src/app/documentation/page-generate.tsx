import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { SubmitPageClient } from './page-generate-client';

export default async function DocumentationPage() {
  const { session } = await getSession();

  if (!session) {
    redirect('/login');
  }

  return <SubmitPageClient />;
}

