import { requireWorkspacePage } from '@/lib/server/workspacePage';
import { SettingsPageClient } from './page-client';

export default async function SettingsPage() {
  const { user } = await requireWorkspacePage();

  return <SettingsPageClient user={user} />;
}
