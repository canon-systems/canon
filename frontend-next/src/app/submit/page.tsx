import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { SubmitPageClient } from './page-client';

export default async function SubmitPage() {
  const { session } = await getSession();

  if (!session) {
    redirect('/login');
  }

  return <SubmitPageClient />;
}

