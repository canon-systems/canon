import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { AccessClient } from './page-client';

export default async function AccessPage() {
  const { session } = await getSession();
  if (!session) redirect('/login');
  return <AccessClient />;
}
