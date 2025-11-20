import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { ArchitecturePageClient } from './page-client';

export default async function ArchitecturePage() {
  const { session } = await getSession();

  if (!session) {
    redirect('/login');
  }

  return <ArchitecturePageClient />;
}

