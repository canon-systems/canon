import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { DocSection } from '../_components/doc-section';

const integrations = [
  { href: '/docs/connect-integrations/github', name: 'GitHub', description: 'Install the Canon GitHub App to sync repos and PR activity.' },
  { href: '/docs/connect-integrations/atlassian', name: 'Atlassian', description: 'Connect Jira; then set up the Jira webhook.' },
  { href: '/docs/connect-integrations/slack', name: 'Slack', description: 'Connect your workspace so Canon can send alerts to a channel.' },
];

export default function ConnectIntegrationsPage() {
  return (
    <DocSection
      title="Connect Integrations"
      description="Connect the tools Canon will use. That includes source integrations (where Canon gets activity data—e.g. GitHub, Jira) and, if you want alerts delivered to a channel, a delivery integration like Slack. Everything is in Settings under the Integrations tab. Use the guides below for each integration."
      whereToGo="Settings → Integrations Tab"
      links={[{ label: 'Open Integrations', href: '/settings?tab=integrations' }]}
      steps={[
        { label: '1', text: 'Go to Settings and open the Integrations tab.' },
        { label: '2', text: 'Connect each integration you need using the guides linked below (GitHub, Atlassian, Slack).' },
        { label: '3', text: 'After you connect, some source integrations may need an extra setup step (e.g. the Jira webhook). You can do that right away or open it later from the integration card in Settings → Integrations.' },
        { label: '4', text: 'Confirm each integration shows as Connected before moving on.' },
      ]}
      tip="Your chosen integrations are connected. If you use Jira, set up the Jira webhook next; then continue to Preferences."
      children={
        <div className="mt-6 space-y-4 border-t border-white/10 pt-6">
          <h2 className="text-lg font-medium text-white">Set Up Each Integration</h2>
          <p className="text-sm text-white/75">
            We currently support the following. Open a guide to see step-by-step instructions:
          </p>
          <ul className="space-y-3">
            {integrations.map((int) => (
              <li key={int.href}>
                <Link
                  href={int.href}
                  className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-zinc-800/80 p-4 transition hover:border-white/20 hover:bg-zinc-800"
                >
                  <div>
                    <p className="font-medium text-white">{int.name}</p>
                    <p className="mt-0.5 text-sm text-white/70">{int.description}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-white/50" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      }
    />
  );
}
