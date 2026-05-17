import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { MilestonesClient } from './page-client';

export default async function MilestonesPage() {
  const { session } = await getSession();
  if (!session) redirect('/login');
  return <MilestonesClient />;
}
