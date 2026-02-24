import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { DocSection } from '../_components/doc-section';

export default function JiraWebhookSetupPage() {
  return (
    <DocSection
      title="Jira Webhook Setup"
      description="So Canon can receive live issue updates from Jira, a Jira administrator creates one webhook in Jira that points to Canon and uses your webhook URL and secret. Canon shows these in the Configure Jira webhook flow in Settings → Integrations (e.g. after connecting Atlassian or via the Atlassian card)."
      whereToGo="Jira: Settings (gear) → System → Advanced → WebHooks"
      links={[
        { label: 'Get Webhook Details in Canon', href: '/settings?tab=integrations&jira_webhook=1' },
      ]}
      tip="The Jira webhook is created in Jira with Canon’s URL and secret. Continue to Preferences, then add Jira projects as sources."
    >
      <div className="mt-6 space-y-6 border-t border-white/10 pt-6">
        <h2 className="text-lg font-medium text-white">Steps</h2>
        <ul className="list-inside list-disc space-y-2 text-sm text-white/80">
          <li>In Canon: open the Configure Jira webhook modal and copy the Webhook URL and Webhook secret.</li>
          <li>In Jira: Settings (gear) → System → Advanced → WebHooks. Create a webhook; paste the URL and secret.</li>
          <li>Events: under Issue, enable <strong>created</strong> and <strong>updated</strong>.</li>
          <li>JQL filter: limit to the projects you’ll add as sources (use the recommended JQL from the modal if shown).</li>
          <li>Save. Once the webhook is active, Canon will receive live issue updates from Jira.</li>
        </ul>
        <Link
          href="/settings?tab=integrations&jira_webhook=1"
          className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-sm font-medium text-white/90 transition hover:bg-white/10"
        >
          Get Webhook Details in Canon
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
        <p className="text-sm text-white/60">
          More integrations may require similar setup in the future; we’ll add guides here as we add them.
        </p>
      </div>
    </DocSection>
  );
}
