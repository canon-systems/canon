import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { NewHireFormClient } from './page-client';

export default async function NewHirePage() {
  const { session } = await getSession();
  if (!session) redirect('/login');
  return <NewHireFormClient />;
}
