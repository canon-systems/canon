import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

export default async function NewHireDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { session } = await getSession();
  if (!session) redirect('/login');
  const { id } = await params;
  redirect(`/new-hires?hire=${id}`);
}
