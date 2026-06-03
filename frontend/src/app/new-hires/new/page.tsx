import { requireWorkspacePage } from '@/lib/server/workspacePage';
import { NewHireFormClient } from './page-client';

export default async function NewHirePage() {
  await requireWorkspacePage();
  return <NewHireFormClient />;
}
