import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { NewHiresClient } from './page-client';

export default async function NewHiresPage() {
  const { session } = await getSession();
  if (!session) redirect('/login');
  return <NewHiresClient />;
}
