import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { KnowledgeClient } from './page-client';

export default async function KnowledgePage() {
  const { session } = await getSession();
  if (!session) redirect('/login');
  return <KnowledgeClient />;
}
