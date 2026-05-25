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
    description: 'Keep company context fresh so onboarding briefs and readiness signals always reflect what\'s current.',
    action: 'Connect Knowledge',
    icon: IconDatabase,
  },
  {
    step: '02',
    href: '/milestones',
    title: 'Milestones',
    description: 'Define role-specific capabilities and keep every hire current as your product and market shift.',
    action: 'Review Milestones',
    icon: IconFlag,
  },
  {
    step: '03',
    href: '/new-hires/new',
    title: 'New hire path',
    description: 'Assign milestones, access requests, and readiness briefings to each hire from day one.',
    action: 'Add New Hire',
    icon: IconUsers,
  },
  {
    step: '04',
    href: '/readiness',
    title: 'Readiness signals',
    description: 'Detect product and customer changes before they create gaps in the field.',
    action: 'Check Readiness',
    icon: IconRadar,
  },
];

const suggestedPath = [
  { href: '/knowledge', title: 'Connect your knowledge sources', description: 'Keep onboarding briefs and readiness signals current.' },
  { href: '/milestones', title: 'Review and tailor milestones', description: 'Align capabilities to your GTM roles.' },
  { href: '/new-hires/new', title: 'Add your next hire', description: 'Launch a personalized onboarding path.' },
  { href: '/readiness', title: 'Check readiness signals', description: 'Keep your team current as product and market change.' },
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
    <div className="flex h-full flex-col overflow-hidden">
      <div
        className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b shrink-0"
        style={{ borderColor: 'var(--border-tertiary)' }}
      >
        <div>
          <h1 className="type-page-title" style={{ color: 'var(--text-primary)' }}>Welcome to Canon</h1>
          <p className="type-page-subtitle mt-[2px]" style={{ color: 'var(--text-tertiary)' }}>
            Keep GTM hires productive and your whole team field-ready as your product and market evolve.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button asChild variant="secondary" size="sm">
            <Link href="/new-hires">
              <IconUsers size={13} /> View Hires
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/new-hires/new">
              <IconUsers size={13} /> Add New Hire
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">

          {/* Main column — ramp loop */}
          <div>
            <div
              className="flex items-start justify-between gap-4 pb-5 border-b"
              style={{ borderColor: 'var(--border-tertiary)' }}
            >
              <div>
                <h2 className="type-section-title" style={{ color: 'var(--text-primary)' }}>Start the ramp loop</h2>
                <p className="type-body mt-1 max-w-lg leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
                  Canon keeps both onboarding and field readiness in a continuous loop: source the context, define the path, launch the ramp, then stay ahead of change as it happens.
                </p>
              </div>
              <Button asChild variant="secondary" size="sm" className="shrink-0">
                <Link href="/readiness">
                  <IconRefresh size={13} /> How It Updates
                </Link>
              </Button>
            </div>

            <div className="flex flex-col">
              {rampLoop.map((item, index) => {
                const Icon = item.icon;
                const isLast = index === rampLoop.length - 1;
                return (
                  <div
                    key={item.step}
                    className="flex gap-4 py-5"
                    style={{ borderBottom: isLast ? 'none' : '1px solid var(--border-tertiary)' }}
                  >
                    <div className="flex flex-col items-center shrink-0">
                      <div
                        className="w-9 h-9 rounded-[8px] flex items-center justify-center"
                        style={{ backgroundColor: 'var(--canon-purple-light)', color: 'var(--canon-purple)' }}
                      >
                        <Icon size={17} />
                      </div>
                      {!isLast && (
                        <div className="mt-3 flex-1 w-px" style={{ backgroundColor: 'var(--border-secondary)' }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="type-caption font-semibold" style={{ color: 'var(--canon-purple)' }}>{item.step}</span>
                          <h3 className="type-card-title" style={{ color: 'var(--text-primary)' }}>{item.title}</h3>
                        </div>
                        <p className="type-body leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
                          {item.description}
                        </p>
                      </div>
                      <Button asChild variant="secondary" size="sm" className="shrink-0 self-start">
                        <Link href={item.href}>
                          {item.action}
                          <IconArrowRight size={13} />
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              className="flex items-start gap-3 pt-4 border-t"
              style={{ borderColor: 'var(--border-tertiary)' }}
            >
              <IconRoute size={15} className="shrink-0 mt-[2px]" style={{ color: 'var(--text-tertiary)' }} />
              <p className="type-body leading-[1.5]" style={{ color: 'var(--text-tertiary)' }}>
                Readiness signals feed back into knowledge and milestones, so every hire and every role stays current — not just at day one.
              </p>
            </div>
          </div>

          {/* Sidebar */}
          <aside className="flex flex-col gap-4">
            <div
              className="rounded-[8px] border px-5 py-5"
              style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-tertiary)' }}
            >
              <h2 className="type-section-title" style={{ color: 'var(--text-primary)' }}>Suggested path</h2>
              <p className="type-body mt-1 leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
                The steps that build onboarding strength and field readiness together.
              </p>
              <ol className="mt-4 flex flex-col gap-1">
                {suggestedPath.map((step, index) => (
                  <li key={step.href}>
                    <Link
                      href={step.href}
                      className="group flex items-start gap-3 rounded-[7px] px-1 py-2 transition-colors duration-[120ms] hover:bg-[var(--bg-secondary)]"
                    >
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
                      <IconChevronRight size={14} className="mt-[6px] shrink-0 text-[var(--text-tertiary)] transition-colors duration-[120ms] group-hover:text-[var(--text-primary)]" />
                    </Link>
                  </li>
                ))}
              </ol>
            </div>

            <div
              className="rounded-[8px] border px-5 py-5"
              style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-tertiary)' }}
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="type-section-title" style={{ color: 'var(--text-primary)' }}>Integrations</h2>
                  <p className="type-body mt-1" style={{ color: 'var(--text-secondary)' }}>
                    Connect the tools that hold onboarding context.
                  </p>
                </div>
                <Button asChild variant="ghost" size="sm" className="shrink-0 text-[var(--canon-purple)] hover:text-[var(--canon-purple)]">
                  <Link href="/settings?tab=integrations">
                    View <IconChevronRight size={13} />
                  </Link>
                </Button>
              </div>
              <div className="flex flex-col">
                {integrations.map((integration) => (
                  <Link
                    key={integration.name}
                    href={integration.href}
                    className="group flex items-center gap-3 border-t py-3 first:border-t-0 transition-colors duration-[120ms]"
                    style={{ borderColor: 'var(--border-tertiary)' }}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                      <IntegrationLogos provider={integration.icon} size={22} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block type-body-strong" style={{ color: 'var(--text-primary)' }}>{integration.name}</span>
                      <span className="mt-[2px] flex items-center gap-1.5 type-caption" style={{ color: 'var(--text-tertiary)' }}>
                        <IconPlugConnected size={11} />
                        {integration.status}
                      </span>
                    </span>
                    <IconChevronRight size={14} className="shrink-0 text-[var(--text-tertiary)] transition-colors duration-[120ms] group-hover:text-[var(--text-primary)]" />
                  </Link>
                ))}
              </div>
            </div>

            <div
              className="rounded-[8px] border px-4 py-3"
              style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-tertiary)' }}
            >
              <div className="flex items-start gap-3">
                <span className="mt-[1px] flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--green-bg)] text-[var(--green)]">
                  <IconCheck size={14} />
                </span>
                <p className="type-body leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
                  Canon works best when milestones are approved before the next hire starts.
                </p>
              </div>
            </div>
          </aside>

        </div>
      </div>
    </div>
  );
}
