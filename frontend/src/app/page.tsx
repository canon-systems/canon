import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  IconArrowRight,
  IconCheck,
  IconChevronRight,
  IconDatabase,
  IconFlag,
  IconPlugConnected,
  IconRadar,
  IconRefresh,
  IconRoute,
  IconUsers,
} from '@tabler/icons-react';
import { getSession } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { IntegrationLogos } from '@/components/IntegrationLogos';

const rampLoop = [
  {
    step: '01',
    href: '/knowledge',
    title: 'Knowledge sync',
    description: 'Keep company context fresh so every ramp brief points to the right source.',
    action: 'Connect Knowledge',
    icon: IconDatabase,
  },
  {
    step: '02',
    href: '/milestones',
    title: 'Milestones',
    description: 'Define role-specific expectations and approve the path from day one to impact.',
    action: 'Review Milestones',
    icon: IconFlag,
  },
  {
    step: '03',
    href: '/new-hires/new',
    title: 'New hire path',
    description: 'Assign the right milestones, access requests, and learning moments to each hire.',
    action: 'Add New Hire',
    icon: IconUsers,
  },
  {
    step: '04',
    href: '/readiness',
    title: 'Readiness signals',
    description: 'Track product and customer changes before they become ramp blockers.',
    action: 'Check Readiness',
    icon: IconRadar,
  },
];

const suggestedPath = [
  { href: '/knowledge', title: 'Connect your knowledge sources', description: 'Keep onboarding context fresh and searchable.' },
  { href: '/milestones', title: 'Review and tailor milestones', description: 'Align expectations to your GTM roles.' },
  { href: '/new-hires/new', title: 'Add your next hire', description: 'Launch a personalized ramp.' },
  { href: '/readiness', title: 'Check readiness signals', description: 'Spot blockers before they slow progress.' },
];

const integrations = [
  { href: '/settings?tab=integrations', name: 'Slack', status: 'Connect in settings', icon: 'slack' as const },
  { href: '/knowledge', name: 'GitHub', status: 'Add as knowledge', icon: 'github' as const },
  { href: '/knowledge', name: 'Confluence', status: 'Add as knowledge', icon: 'confluence' as const },
];

export default async function HomePage() {
  const { session } = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5">
      <section
        className="relative overflow-hidden rounded-[10px] border px-6 py-6"
        style={{
          background: 'linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-primary) 58%, rgba(124, 92, 255, 0.16) 100%)',
          borderColor: 'var(--border-tertiary)',
        }}
      >
        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="type-page-title" style={{ color: 'var(--text-primary)' }}>
              Welcome to Canon
            </h1>
            <p className="type-page-subtitle mt-[6px] max-w-2xl leading-[1.5]" style={{ color: 'var(--text-tertiary)' }}>
              Guide technical GTM hires from day one to full impact by keeping knowledge, milestones, access, and readiness signals in one loop.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row lg:flex-col">
            <Button asChild>
              <Link href="/new-hires/new">
                <IconUsers size={14} />
                Add New Hire
              </Link>
            </Button>
            <Button asChild variant="ghost" className="justify-center text-[var(--canon-purple)] hover:text-[var(--canon-purple)]">
              <Link href="/new-hires">
                View All Hires
                <IconChevronRight size={14} />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid min-h-0 gap-5 py-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div
          className="rounded-[10px] border px-6 py-6"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-tertiary)' }}
        >
          <div className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-start sm:justify-between" style={{ borderColor: 'var(--border-tertiary)' }}>
            <div>
              <h2 className="type-section-title" style={{ color: 'var(--text-primary)' }}>
                Start the ramp loop
              </h2>
              <p className="type-body mt-2 max-w-xl leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
                Canon keeps onboarding work moving as a continuous cycle: source the context, define the path, launch the ramp, then respond to what changes.
              </p>
            </div>
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link href="/readiness">
                <IconRefresh size={14} />
                How It Updates
              </Link>
            </Button>
          </div>

          <div className="mt-6 flex flex-col gap-5">
            {rampLoop.map((item, index) => {
              const Icon = item.icon;
              const isLast = index === rampLoop.length - 1;
              return (
                <div key={item.step} className="grid gap-4 sm:grid-cols-[96px_minmax(0,1fr)_220px] sm:items-center">
                  <div className="relative flex items-center gap-3 sm:flex-col sm:gap-2">
                    <div
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border"
                      style={{
                        borderColor: 'var(--canon-purple)',
                        backgroundColor: 'var(--canon-purple-light)',
                        color: 'var(--canon-purple)',
                      }}
                    >
                      <Icon size={24} />
                    </div>
                    {!isLast && (
                      <div className="hidden h-8 w-px sm:block" style={{ backgroundColor: 'var(--canon-purple)' }} />
                    )}
                    <span className="type-panel-title text-[var(--canon-purple)] sm:hidden">{item.step}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="hidden type-panel-title text-[var(--canon-purple)] sm:inline">{item.step}</span>
                      <h3 className="type-card-title" style={{ color: 'var(--text-primary)' }}>{item.title}</h3>
                    </div>
                    <p className="type-body mt-2 max-w-xl leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
                      {item.description}
                    </p>
                  </div>
                  <Button asChild variant="outline" className="justify-between sm:w-full">
                    <Link href={item.href}>
                      {item.action}
                      <IconArrowRight size={14} />
                    </Link>
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="mt-7 flex items-start gap-3 border-t pt-5" style={{ borderColor: 'var(--border-tertiary)' }}>
            <IconRoute size={18} className="mt-[1px] shrink-0 text-[var(--text-tertiary)]" />
            <p className="type-body leading-[1.5]" style={{ color: 'var(--text-tertiary)' }}>
              Readiness findings feed back into knowledge and milestone updates, so every hire gets current context instead of a static checklist.
            </p>
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-[10px] border px-5 py-5" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-tertiary)' }}>
            <h2 className="type-section-title" style={{ color: 'var(--text-primary)' }}>
              Suggested path
            </h2>
            <p className="type-body mt-2 leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
              Based on a fresh workspace, here is the order that makes Canon useful fastest.
            </p>
            <ol className="mt-5 flex flex-col gap-1">
              {suggestedPath.map((step, index) => (
                <li key={step.href}>
                  <Link href={step.href} className="group flex items-start gap-3 rounded-[7px] px-1 py-2 transition-colors duration-[120ms] hover:bg-[var(--bg-secondary)]">
                    <span
                      className="mt-[2px] flex h-7 w-7 shrink-0 items-center justify-center rounded-full border type-control-sm"
                      style={{
                        borderColor: index === 0 ? 'var(--canon-purple)' : 'var(--border-secondary)',
                        color: index === 0 ? 'var(--canon-purple)' : 'var(--text-tertiary)',
                      }}
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block type-body-strong" style={{ color: 'var(--text-primary)' }}>{step.title}</span>
                      <span className="block type-caption mt-[2px] leading-[1.45]" style={{ color: 'var(--text-tertiary)' }}>{step.description}</span>
                    </span>
                    <IconChevronRight size={15} className="mt-[6px] shrink-0 text-[var(--text-tertiary)] transition-colors duration-[120ms] group-hover:text-[var(--text-primary)]" />
                  </Link>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-[10px] border px-5 py-5" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-tertiary)' }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="type-section-title" style={{ color: 'var(--text-primary)' }}>
                  Integrations
                </h2>
                <p className="type-body mt-2" style={{ color: 'var(--text-secondary)' }}>
                  Connect the tools that hold onboarding context.
                </p>
              </div>
              <Button asChild variant="ghost" size="sm" className="shrink-0 text-[var(--canon-purple)] hover:text-[var(--canon-purple)]">
                <Link href="/settings?tab=integrations">
                  View
                  <IconChevronRight size={14} />
                </Link>
              </Button>
            </div>
            <div className="mt-5 flex flex-col">
              {integrations.map((integration) => {
                return (
                  <Link
                    key={integration.name}
                    href={integration.href}
                    className="group flex items-center gap-3 border-t py-3 first:border-t-0"
                    style={{ borderColor: 'var(--border-tertiary)' }}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                      <IntegrationLogos provider={integration.icon} size={23} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block type-body-strong" style={{ color: 'var(--text-primary)' }}>{integration.name}</span>
                      <span className="mt-[2px] flex items-center gap-1.5 type-caption" style={{ color: 'var(--text-tertiary)' }}>
                        <IconPlugConnected size={12} />
                        {integration.status}
                      </span>
                    </span>
                    <IconChevronRight size={15} className="shrink-0 text-[var(--text-tertiary)] transition-colors duration-[120ms] group-hover:text-[var(--text-primary)]" />
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="rounded-[10px] border px-5 py-4" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-tertiary)' }}>
            <div className="flex items-start gap-3">
              <span className="mt-[1px] flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--green-bg)] text-[var(--green)]">
                <IconCheck size={15} />
              </span>
              <p className="type-body leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
                Canon works best when milestones are approved before the next hire starts.
              </p>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
