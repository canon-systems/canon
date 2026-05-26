import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { ReadinessClient } from './page-client';

export default async function ReadinessPage() {
  const { session } = await getSession();
  if (!session) redirect('/login');
  return <ReadinessClient />;
}
