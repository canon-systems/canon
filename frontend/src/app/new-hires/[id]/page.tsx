import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { NewHireDetailClient } from './page-client';

export default async function NewHireDetailPage() {
  const { session } = await getSession();
  if (!session) redirect('/login');
  return <NewHireDetailClient />;
}
