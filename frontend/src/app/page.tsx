import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  IconArrowRight,
  IconChevronRight,
  IconDatabase,
  IconFlag,
  IconRadar,
  IconTool,
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
    description: 'Keep company context fresh so hire paths, field updates, and readiness alerts reflect what is true now.',
    action: 'Connect Knowledge',
    icon: IconDatabase,
  },
  {
    step: '02',
    href: '/milestones',
    title: 'Readiness milestones',
    description: 'Define the capabilities, real work triggers, and success signals that prove field readiness by role.',
    action: 'Review Milestones',
    icon: IconFlag,
  },
  {
    step: '03',
    href: '/new-hires/new',
    title: 'Hire path',
    description: 'Launch a readiness path for each new hire with milestones, access requests, and contextual briefs from day one.',
    action: 'Launch Hire Path',
    icon: IconUsers,
  },
  {
    step: '04',
    href: '/readiness',
    title: 'Readiness signals',
    description: 'Surface product, customer, and field changes that affect new hires and the broader team.',
    action: 'Review Signals',
    icon: IconRadar,
  },
];

const foundationLinks = [
  {
    href: '/knowledge',
    title: 'Connect knowledge',
    description: 'Give Canon the source material it should use for hire paths, milestones, and readiness signals.',
    icon: IconDatabase,
  },
  {
    href: '/milestones',
    title: 'Shape readiness milestones',
    description: 'Turn role expectations into clear proof points for Technical GTM readiness.',
    icon: IconFlag,
  },
  {
    href: '/settings?tab=tools',
    title: 'Set tool access',
    description: 'Map every required tool to the roles and owners who can grant access.',
    icon: IconTool,
  },
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
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-8">
          <section
            className="border-b pb-8"
            style={{ borderColor: 'var(--border-tertiary)' }}
          >
            <div className="max-w-3xl">
              <h1 className="max-w-3xl text-[30px] font-semibold leading-[1.12] tracking-normal sm:text-[34px]" style={{ color: 'var(--text-primary)' }}>
                Keep Technical GTM teams customer-ready
              </h1>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <Button asChild size="sm">
                  <Link href="/new-hires/new">
                    <IconUsers size={13} /> Launch Hire Path
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="sm">
                  <Link href="/knowledge">
                    <IconDatabase size={13} /> Connect Context
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/new-hires">
                    View Hire Paths <IconArrowRight size={13} />
                  </Link>
                </Button>
              </div>
            </div>
          </section>

          <section>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h2 className="type-section-title" style={{ color: 'var(--text-primary)' }}>The readiness loop</h2>
                <p className="type-body mt-1 max-w-2xl leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
                  Canon connects your knowledge, gets new hires ready faster, and monitors for changes that affect the field.
                </p>
              </div>
            </div>

            <div className="relative mt-6">
              <div className="absolute bottom-5 left-5 top-5 w-px lg:hidden" style={{ backgroundColor: 'var(--border-tertiary)' }} />
              <div className="absolute left-[6%] right-[6%] top-5 hidden h-px lg:block" style={{ backgroundColor: 'var(--border-tertiary)' }} />
              <div className="grid gap-6 lg:grid-cols-4">
                {rampLoop.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.step}
                      href={item.href}
                      className="group relative flex min-w-0 gap-4 rounded-[8px] p-1 transition-colors duration-[120ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--canon-purple)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-page)] lg:flex-col lg:gap-3"
                    >
                      <span
                        className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] border"
                        style={{
                          backgroundColor: 'var(--bg-primary)',
                          borderColor: 'var(--border-secondary)',
                          color: 'var(--canon-purple)',
                        }}
                      >
                        <Icon size={18} />
                      </span>
                      <span className="min-w-0 pb-2 lg:pb-0">
                        <span className="block type-caption font-semibold" style={{ color: 'var(--canon-purple)' }}>{item.step}</span>
                        <span className="mt-1 block type-card-title text-[var(--text-primary)] transition-colors duration-[120ms] group-hover:text-[var(--canon-purple)]">
                          {item.title}
                        </span>
                        <span className="mt-2 block type-body leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
                          {item.description}
                        </span>
                        <span className="mt-3 flex items-center gap-1.5 type-control-sm font-medium" style={{ color: 'var(--canon-purple)' }}>
                          {item.action}
                          <IconArrowRight size={13} className="transition-transform duration-[120ms] group-hover:translate-x-0.5" />
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>

            <Link
              href="/readiness"
              className="group mt-6 flex flex-col gap-4 border-t pt-5 transition-colors duration-[120ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--canon-purple)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-page)] sm:flex-row sm:items-start sm:justify-between"
              style={{ borderColor: 'var(--border-tertiary)' }}
            >
              <span className="flex min-w-0 items-start gap-3">
                <span
                  className="mt-[1px] flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]"
                  style={{ backgroundColor: 'var(--canon-purple-light)', color: 'var(--canon-purple)' }}
                >
                  <IconRadar size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block type-card-title text-[var(--text-primary)] transition-colors duration-[120ms] group-hover:text-[var(--canon-purple)]">
                    Readiness keeps the path current
                  </span>
                  <span className="mt-1 block type-body max-w-3xl leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
                    Product, customer, and field changes loop back into knowledge and milestones, so readiness keeps pace after day one.
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 type-control-sm font-medium" style={{ color: 'var(--canon-purple)' }}>
                Review signals
                <IconArrowRight size={13} className="transition-transform duration-[120ms] group-hover:translate-x-0.5" />
              </span>
            </Link>
          </section>

          <section
            className="grid gap-8 border-t pt-7 lg:grid-cols-[minmax(0,1fr)_360px]"
            style={{ borderColor: 'var(--border-tertiary)' }}
          >
            <div className="min-w-0">
              <h2 className="type-section-title" style={{ color: 'var(--text-primary)' }}>Prepare the readiness system</h2>
              <p className="type-body mt-1 max-w-2xl leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
                Customer-ready teams start with trusted context, role-specific proof points, and clear access ownership.
              </p>
              <div className="mt-4 flex flex-col">
                {foundationLinks.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="group flex items-start gap-3 border-t py-4 first:border-t-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--canon-purple)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-page)]"
                      style={{ borderColor: 'var(--border-tertiary)' }}
                    >
                      <span
                        className="mt-[1px] flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]"
                        style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                      >
                        <Icon size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block type-body-strong text-[var(--text-primary)] transition-colors duration-[120ms] group-hover:text-[var(--canon-purple)]">{item.title}</span>
                        <span className="mt-[2px] block type-caption leading-[1.45]" style={{ color: 'var(--text-tertiary)' }}>{item.description}</span>
                      </span>
                      <IconChevronRight size={14} className="mt-[6px] shrink-0 text-[var(--text-tertiary)] transition-colors duration-[120ms] group-hover:text-[var(--text-primary)]" />
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="type-section-title" style={{ color: 'var(--text-primary)' }}>Bring in context</h2>
                  <p className="type-body mt-1 leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
                    Connect the sources where readiness gaps begin.
                  </p>
                </div>
                <Button asChild variant="ghost" size="sm" className="shrink-0 text-[var(--canon-purple)] hover:text-[var(--canon-purple)]">
                  <Link href="/settings?tab=integrations">
                    View <IconChevronRight size={13} />
                  </Link>
                </Button>
              </div>
              <div className="mt-4 flex flex-col">
                {integrations.map((integration) => (
                  <Link
                    key={integration.name}
                    href={integration.href}
                    className="group flex items-center gap-3 border-t py-4 first:border-t-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--canon-purple)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-page)]"
                    style={{ borderColor: 'var(--border-tertiary)' }}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                      <IntegrationLogos provider={integration.icon} size={22} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block type-body-strong text-[var(--text-primary)] transition-colors duration-[120ms] group-hover:text-[var(--canon-purple)]">{integration.name}</span>
                      <span className="block type-caption mt-[2px]" style={{ color: 'var(--text-tertiary)' }}>{integration.status}</span>
                    </span>
                    <IconChevronRight size={14} className="shrink-0 text-[var(--text-tertiary)] transition-colors duration-[120ms] group-hover:text-[var(--text-primary)]" />
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
