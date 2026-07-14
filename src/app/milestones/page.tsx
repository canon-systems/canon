import { requireWorkspacePage } from '@/lib/server/workspacePage';
import { MilestonesClient } from './page-client';

export default async function MilestonesPage() {
  await requireWorkspacePage();
  return <MilestonesClient />;
}
