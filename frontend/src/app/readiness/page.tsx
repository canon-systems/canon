import { requireWorkspacePage } from '@/lib/server/workspacePage';
import { ReadinessClient } from './page-client';

export default async function ReadinessPage() {
  await requireWorkspacePage();
  return <ReadinessClient />;
}
