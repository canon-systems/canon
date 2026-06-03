import { requireWorkspacePage } from '@/lib/server/workspacePage';
import { KnowledgeClient } from './page-client';

export default async function KnowledgePage() {
  await requireWorkspacePage();
  return <KnowledgeClient />;
}
