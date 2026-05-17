import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { DashboardClient } from './page-client';

export default async function DashboardPage() {
  const { session } = await getSession();
  if (!session) redirect('/login');
  return <DashboardClient />;
}
