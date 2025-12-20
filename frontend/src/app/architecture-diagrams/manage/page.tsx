import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { ArchitectureDiagramsManagePageClient } from './page-client';

export default async function ArchitectureDiagramsManagePage() {
    const { session } = await getSession();

    if (!session) {
        redirect('/login');
    }

    return <ArchitectureDiagramsManagePageClient />;
}
