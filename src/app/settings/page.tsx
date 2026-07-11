import { redirect } from 'next/navigation';

import { requireWorkspacePage } from '@/lib/server/workspacePage';
import { SettingsPageClient } from './page-client';

type SettingsPageProps = {
  searchParams: Promise<{
    tab?: string;
  }>;
};

const LEGACY_READINESS_TABS = new Set(['roles', 'tools']);

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = await searchParams;
  if (params.tab && LEGACY_READINESS_TABS.has(params.tab)) {
    redirect('/settings?tab=readiness');
  }

  const { user } = await requireWorkspacePage();

  return <SettingsPageClient user={user} />;
}
