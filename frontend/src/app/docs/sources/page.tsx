import Link from 'next/link';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info } from 'lucide-react';

import { DocSection } from '../_components/doc-section';

export default function SourcesPage() {
  return (
    <DocSection
      title="Sources"
      description="Sources are the specific items Canon monitors—e.g. repositories, projects, or other units depending on the integration. You add them on the Sources page and assign each to a domain so Canon can group work by product area."
      whereToGo="Sources Page"
      links={[{ label: 'Go to Sources', href: '/sources' }]}
      prerequisite={
        <Alert variant="default" className="mb-6 border-amber-500/30 bg-amber-500/10">
          <Info className="h-4 w-4 text-amber-400" />
          <AlertTitle className="text-amber-200">Jira prerequisite</AlertTitle>
          <AlertDescription>
            For Jira, ensure the webhook is set up in Settings → Integrations (
            <Link href="/docs/jira-webhook-setup" className="font-medium text-amber-200 underline hover:text-amber-100">
              Jira Webhook Setup
            </Link>
            ) so Canon receives live issue updates. You MUST do this before adding Jira projects as sources.
          </AlertDescription>
        </Alert>
      }
      steps={[
        { label: '1', text: 'Open the Sources page and click Add Source.' },
        { label: '2', text: 'Pick the sources you want from your connected integrations (e.g. repos, projects) and add them.' },
        { label: '3', text: 'Wait until each source reaches Ready status. You can leave and come back; the list will update.' },
        { label: '4', text: 'For each ready source, set a Domain (preset or custom). Use the same domain for sources that belong to the same product or team—Canon uses domains to organize trends and signals.' },
      ]}
      tip="Your key sources are Ready and have domains set. You can start using History and Signals."
    />
  );
}
