import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { ArchitectureDiagramsPageClient } from './page-client';

export default async function ArchitectureDiagramsPage() {
    const { session } = await getSession();

    if (!session) {
        redirect('/login');
    }

    return <ArchitectureDiagramsPageClient />;
}
