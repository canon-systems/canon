import { BookOpen, ChevronRight, Link2, Settings, Layers, History, Activity, MessageCircle } from 'lucide-react';
import Link from 'next/link';

const sections = [
  {
    href: '/docs/overview',
    title: 'Overview',
    description: 'What Canon does and how setup fits together.',
    icon: BookOpen,
  },
  {
    href: '/docs/connect-integrations',
    title: 'Connect Integrations',
    description: 'Connect GitHub, Atlassian, and Slack—with guides for each.',
    icon: Link2,
  },
  {
    href: '/docs/jira-webhook-setup',
    title: 'Jira Webhook Setup',
    description: 'Set up the Jira webhook so Canon receives live issue updates.',
    icon: Settings,
  },
  {
    href: '/docs/preferences',
    title: 'Preferences',
    description: 'Alert delivery, time zone, and signal defaults.',
    icon: Settings,
  },
  {
    href: '/docs/sources',
    title: 'Sources',
    description: 'Add repos and projects and assign domains.',
    icon: Layers,
  },
  {
    href: '/docs/history',
    title: 'History',
    description: 'Compare a period to a baseline and drill into changes.',
    icon: History,
  },
  {
    href: '/docs/signals',
    title: 'Signals',
    description: 'Monitor and investigate high-priority deviations.',
    icon: Activity,
  },
  {
    href: '/docs/help',
    title: 'Need Help?',
    description: 'Contact support and get unblocked.',
    icon: MessageCircle,
  },
];

export default function DocsHomePage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Canon Docs</h1>
        <p className="mt-2 text-lg text-white/75">
          Set up Canon, connect your tools, and start monitoring changes. Pick a section below to get started.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Link
              key={section.href}
              href={section.href}
              className="flex items-start gap-4 rounded-2xl border border-white/10 bg-zinc-900/80 p-5 transition hover:border-white/20 hover:bg-zinc-800/80"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-zinc-800">
                <Icon className="h-5 w-5 text-white/80" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-white">{section.title}</h2>
                <p className="mt-1 text-sm text-white/70">{section.description}</p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-white/50" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
