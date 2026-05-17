import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

export default async function HomePage() {
  const { session, user } = await getSession();

  if (!session || !user) {
    redirect('/login');
  }

  redirect('/dashboard');
}
