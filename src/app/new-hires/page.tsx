import { Suspense } from 'react';
import { requireWorkspacePage } from '@/lib/server/workspacePage';
import { NewHiresClient } from './page-client';

export default async function NewHiresPage() {
  await requireWorkspacePage();
  return (
    <Suspense fallback={null}>
      <NewHiresClient />
    </Suspense>
  );
}
