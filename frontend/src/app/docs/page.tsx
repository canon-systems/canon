import { BookOpen, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

interface GuideSection {
  id: string;
  title: string;
  description: string;
  whereToGo: string;
  links: Array<{ label: string; href: string }>;
  steps: string[];
  beforeYouMoveOn: string;
}

type RenderedStep = {
  isSubstep: boolean;
  label: string;
  text: string;
};

function buildRenderedSteps(steps: string[]): RenderedStep[] {
  const rendered: RenderedStep[] = [];
  let topLevelNumber = 0;

  for (const rawStep of steps) {
    const substepMatch = rawStep.match(/^(\d+[a-z])\.\s*(.+)$/i);
    if (substepMatch) {
      rendered.push({
        isSubstep: true,
        label: substepMatch[1].toLowerCase(),
        text: substepMatch[2],
      });
      continue;
    }

    topLevelNumber += 1;
    rendered.push({
      isSubstep: false,
      label: String(topLevelNumber),
      text: rawStep,
    });
  }

  return rendered;
}

const guideSections: GuideSection[] = [
  {
    id: 'integrate-and-configure',
    title: 'Connect Integrations and Configure Preferences',
    description: 'Set up your integrations and Slack delivery preferences before you add sources.',
    whereToGo: 'Settings -> Integrations and Preferences',
    links: [
      { label: 'Go to Integrations', href: '/settings?tab=integrations' },
      { label: 'Go to Preferences', href: '/settings?tab=preferences' },
    ],
    steps: [
      'Open Settings and select the Integrations tab.',
      'Connect the source integrations you want Canon to use.',
      '2a. GitHub connection: provides repository activity such as commits and pull request signals.',
      '2b. Jira connection: provides issue workflow activity such as created, moved, completed, and regressed work.',
      '2c. Slack connection: enables Canon to deliver alert messages to your Slack workspace.',
      'Complete each provider authorization flow, then return to Canon.',
      'Confirm each integration shows as Connected before continuing.',
      'Switch to the Preferences tab.',
      'Choose the Slack delivery preference and enter the Slack Channel ID.',
      'Set your Time Zone (the local timezone Canon uses for date windows and alert timing).',
      'Set Signal Lookback Days (how many recent full days Canon includes when evaluating signal trends).',
      'Click Save Preferences.',
    ],
    beforeYouMoveOn: 'Integrations are connected, Slack delivery is configured, and preferences are saved before source setup.',
  },
  {
    id: 'jira-webhook',
    title: 'Set Up the Canon Webhook in Jira',
    description: 'So Canon can receive live issue updates, someone with Jira administrator access adds one webhook in Jira that points to Canon. If that’s you, follow the steps below; if not, your Jira administrator can do it—share this section with them.',
    whereToGo: 'Jira: Settings (gear) → System → Advanced → WebHooks',
    links: [
      { label: 'Go to Sources', href: '/sources' },
    ],
    steps: [
      'In Jira: click the Settings (gear) icon, then System. In the left sidebar under Advanced, click WebHooks.',
      'Click Create a WebHook (or Add webhook).',
      'Name: use “Canon Integration” (or any name you’ll recognize). Set Status to Enabled.',
      'URL: enter the Canon webhook URL (you\'ll see it in Canon when you connect Jira, or your team can provide it).',
      'Events: under Issue, select created and updated (these are the scopes Canon needs).',
      'JQL filter: use it to limit events to only the sites (projects) you want Canon to track. Enter a JQL query that matches those projects.',
      'If your team uses an optional webhook secret for security, enter it in the Secret field; otherwise leave it blank.',
      'Click Create or Save. The webhook will appear in the list and Jira will start sending events to Canon.',
    ],
    beforeYouMoveOn: 'The Canon webhook is in Jira, enabled, and uses the correct URL so Canon receives issue events.',
  },
  {
    id: 'setup-and-classify',
    title: 'Set Up Sources and Classify Domains',
    description: 'Add the specific sources you want to monitor and assign each one to a product domain. Domains are labels that group related work so Canon can organize trends and signals by product area.',
    whereToGo: 'Sources',
    links: [{ label: 'Go to Sources', href: '/sources' }],
    steps: [
      'Open the Sources page and click Add Source.',
      'Pick the repos or projects you want to ingest, then add them.',
      'Wait until each source reaches Ready status.',
      'For each ready source, set a Domain value (preset or custom). Use the same domain for sources that belong to the same product area.',
      '4a. Domains are the labels that map sources to product areas or teams so Canon can organize trends.',
      '4b. Signals inherit domain tags so the History and Signals pages can surface activity in the right context.',
    ],
    beforeYouMoveOn: 'Your key sources are Ready and assigned to clear domains that match how your team thinks about product areas.',
  },
  {
    id: 'use-history',
    title: 'Use the History Page',
    description: 'Compare recent activity against a baseline window to understand trend shifts across connected sources.',
    whereToGo: 'History',
    links: [{ label: 'Go to History', href: '/history' }],
    steps: [
      'Open History and click Select Primary Range.',
      'Pick the date range you want to analyze and confirm it.',
      'Review the Inside summary for a quick narrative of what changed.',
      'Use the metric cards to compare Current vs Baseline values.',
      'Open Detailed View and switch between Jira or GitHub tabs for event-level drill-down.',
    ],
    beforeYouMoveOn: 'You can explain what changed in your selected period and which source drove it.',
  },
  {
    id: 'use-signals',
    title: 'Use the Signals Page',
    description: 'Monitor the highest-priority deviations and investigate individual signals quickly.',
    whereToGo: 'Signals',
    links: [{ label: 'Go to Signals', href: '/signals' }],
    steps: [
      'Open Signals to see the latest signal feed for your workspace.',
      'Use Date Range to focus on a specific time window.',
      'Filter by Severity and Metric to narrow the list.',
      'Open any signal card (or click Investigate) to view full details.',
      'Use this page daily to spot meaningful movement and escalate where needed.',
    ],
    beforeYouMoveOn: 'You can filter signals confidently and open details for fast investigation.',
  },
];

export default function DocumentationPage() {
  return (
    <div className="min-h-screen px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center">
          <div className="mb-6 inline-flex items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/30 bg-white/20 bg-gradient-to-r from-gray-500 to-gray-700 backdrop-blur-sm">
              <BookOpen className="h-8 w-8 text-white" />
            </div>
          </div>

          <h1 className="mb-4 text-4xl font-bold text-white">How to Use Canon</h1>
          <p className="text-xl text-white/80">
            Follow this flow to connect your tools, configure Canon, and start monitoring changes with confidence.
          </p>
        </div>

        <div className="mb-8 rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-md">
          <p className="text-sm text-white/85">
            Videos are coming soon. For now, this guide gives you the full step-by-step flow in plain language.
          </p>
        </div>

        <div className="space-y-8">
          {guideSections.map((section, index) => (
            <div key={section.id} className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md">
              <div className="px-6 py-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="mb-2 flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-gray-500 to-gray-600 text-sm font-semibold text-white">
                        {index + 1}
                      </div>
                      <h2 className="text-2xl font-bold text-white">{section.title}</h2>
                    </div>

                    <div className="mb-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-white/60">Where to go</p>
                      <p className="text-sm text-white/85">{section.whereToGo}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {section.links.map((link) => (
                          <Link
                            key={`${section.id}-${link.href}`}
                            href={link.href}
                            className="inline-flex items-center rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/90 transition-colors hover:bg-white/15"
                          >
                            {link.label}
                          </Link>
                        ))}
                      </div>
                    </div>

                    <p className="mb-6 leading-relaxed text-white/80">{section.description}</p>

                    <div className="border-t border-white/10 pt-6">
                      <h3 className="mb-4 text-lg font-semibold text-white">Steps</h3>
                      <ol className="space-y-2">
                        {buildRenderedSteps(section.steps).map((step, stepIndex) => (
                          <li
                            key={stepIndex}
                            className={`flex items-start gap-3 text-white/80 ${step.isSubstep ? 'ml-9' : ''}`}
                          >
                            <span
                              className={`mt-0.5 flex flex-shrink-0 items-center justify-center text-xs font-medium text-white ${step.isSubstep
                                ? 'h-6 min-w-[2.25rem] rounded-md border border-white/20 bg-white/5 px-2'
                                : 'h-6 w-6 rounded-full bg-gray-600'
                                }`}
                            >
                              {step.label}
                            </span>
                            <span className="leading-relaxed">{step.text}</span>
                          </li>
                        ))}
                      </ol>
                    </div>

                    <div className="mt-6 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4">
                      <div className="flex items-center gap-2 text-emerald-200">
                        <CheckCircle2 className="h-4 w-4" />
                        <p className="text-sm font-medium">Before you move on</p>
                      </div>
                      <p className="mt-2 text-sm text-emerald-100/90">{section.beforeYouMoveOn}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur-md">
          <div className="text-center">
            <h3 className="mb-4 text-xl font-semibold text-white">Need More Help?</h3>
            <p className="mb-6 text-white/80">If you get stuck, contact support and include your workspace and source details.</p>
            <a
              href="mailto:john@usecanon.com"
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-gray-500 to-gray-600 px-6 py-3 font-medium text-white transition-all hover:from-gray-600 hover:to-gray-700"
            >
              Contact Support
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
