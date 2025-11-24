import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { EditListPageClient } from './page-client';

export default async function EditPage() {
  const { session, user } = await getSession();

  if (!session) {
    redirect('/login');
  }

  // Data will be fetched client-side via API
  return <EditListPageClient user={user} />;
}
