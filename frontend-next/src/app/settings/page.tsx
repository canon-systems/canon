import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { SettingsPageClient } from './page-client';

export default async function SettingsPage() {
  const { user, session } = await getSession();

  if (!session) {
    redirect('/login');
  }

  return <SettingsPageClient user={user} />;
}

