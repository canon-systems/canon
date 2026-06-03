import Link from 'next/link';
import {
  IconArrowRight,
  IconFlag,
  IconLink,
  IconRadar,
  IconTool,
  IconUsers,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { requireWorkspacePage } from '@/lib/server/workspacePage';

const operatingLoop = [
  {
    step: '01',
    href: '/new-hires/new',
    title: 'Launch Hire Path',
    description: 'Create a role-specific path with milestones, access requests, and briefings already in place.',
    action: 'Launch Path',
    icon: IconUsers,
  },
  {
    step: '02',
    href: '/milestones',
    title: 'Verify Real Work',
    description: 'Use capability outcomes and evidence to see whether each person is becoming customer-ready.',
    action: 'Review Evidence',
    icon: IconFlag,
  },
  {
    step: '03',
    href: '/readiness',
    title: 'Close Readiness Gaps',
    description: 'Spot product, customer, and field changes that affect current hires and the broader team.',
    action: 'Review Signals',
    icon: IconRadar,
  },
];

const setupFocus = [
  {
    href: '/settings?tab=roles',
    label: 'Roles',
    title: 'Define Who Canon Supports',
    description: 'Add every Technical GTM role that needs hire paths, readiness milestones, and field updates.',
    action: 'Set Up Roles',
    icon: IconUsers,
    color: 'var(--canon-purple)',
    bg: 'var(--canon-purple-light)',
  },
  {
    href: '/settings?tab=tools',
    label: 'Tools',
    title: 'Map What Each Role Needs',
    description: 'Connect every required system to an owner so access requests are ready before the hire path starts.',
    action: 'Map Tools',
    icon: IconTool,
    color: 'var(--green)',
    bg: 'var(--green-bg)',
  },
  {
    href: '/settings?tab=integrations',
    label: 'Integrations',
    title: 'Connect the Tools Canon Reads',
    description: 'Link the source systems Canon uses to keep readiness paths current as the field changes.',
    action: 'Connect Tools',
    icon: IconLink,
    color: 'var(--amber)',
    bg: 'var(--amber-bg)',
  },
];

export default async function HomePage() {
  await requireWorkspacePage();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-8 sm:px-6 lg:py-10">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-8">
          <section
            aria-labelledby="home-title"
            className="grid gap-8 lg:grid-cols-[minmax(0,680px)_360px] lg:items-start lg:justify-center"
            style={{ borderColor: 'var(--border-tertiary)' }}
          >
            <div className="min-w-0">
              <div className="max-w-3xl">
                <h1 id="home-title" className="max-w-3xl text-[30px] font-semibold leading-[1.12] tracking-normal sm:text-[34px]" style={{ color: 'var(--text-primary)' }}>
                  Keep Technical GTM Teams Customer-Ready
                </h1>
                <p className="type-body mt-3 max-w-2xl leading-[1.6]" style={{ color: 'var(--text-secondary)' }}>
                  Start with the roles you support and the tools they need. Canon uses that foundation to build hire paths, readiness milestones, and field updates that stay current as your product changes.
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <Button asChild size="sm">
                    <Link href="/settings?tab=roles">
                      <IconUsers size={13} /> Set Up Roles
                    </Link>
                  </Button>
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/settings?tab=tools">
                      <IconTool size={13} /> Map Tools
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/new-hires/new">
                      Launch Hire Path <IconArrowRight size={13} />
                    </Link>
                  </Button>
                </div>
              </div>

              <section aria-labelledby="operating-loop-title" className="mt-8 border-t pt-6" style={{ borderColor: 'var(--border-tertiary)' }}>
                <div className="min-w-0">
                  <h2 id="operating-loop-title" className="type-section-title" style={{ color: 'var(--text-primary)' }}>What Happens After Setup</h2>
                  <p className="type-body mt-1 max-w-2xl leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
                    Once roles and tools are mapped, Canon turns them into operating workflows for hires and field teams.
                  </p>
                </div>

                <div className="relative mt-5">
                  <div className="absolute bottom-6 left-6 top-6 w-px lg:hidden" style={{ backgroundColor: 'var(--border-tertiary)' }} />
                  <div className="grid gap-5 lg:grid-cols-3">
                    {operatingLoop.map((item, index) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.step}
                          href={item.href}
                          className="group relative flex min-w-0 gap-4 rounded-[8px] p-1 transition-colors duration-[120ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--canon-purple)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-page)] lg:flex-col lg:gap-3"
                        >
                          {index < operatingLoop.length - 1 && (
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute left-12 right-[-1.25rem] top-6 hidden h-px lg:block"
                              style={{ backgroundColor: 'var(--border-tertiary)' }}
                            />
                          )}
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
              </section>
            </div>

            <aside
              aria-label="Readiness foundation setup"
              className="rounded-[8px] border p-4"
              style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-tertiary)' }}
            >
              <div className="type-kicker mb-3" style={{ color: 'var(--text-tertiary)' }}>Foundation First</div>
              <div className="flex flex-col gap-3">
                {setupFocus.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="group block rounded-[8px] border p-3 transition-colors duration-[120ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--canon-purple)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-secondary)] hover:border-[var(--border-secondary)]"
                      style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-tertiary)' }}
                    >
                      <span className="flex items-start gap-3">
                        <span className="flex w-14 shrink-0 self-stretch flex-col items-center justify-center gap-2">
                          <span
                            className="flex h-8 w-8 items-center justify-center rounded-[7px]"
                            style={{ backgroundColor: item.bg, color: item.color }}
                          >
                            <Icon size={16} />
                          </span>
                          <span className="max-w-full text-center type-caption font-medium leading-[1.2]" style={{ color: item.color }}>{item.label}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="mt-[2px] block type-body-strong text-[var(--text-primary)]">{item.title}</span>
                          <span className="mt-1 block type-caption leading-[1.45]" style={{ color: 'var(--text-tertiary)' }}>{item.description}</span>
                          <span className="mt-3 inline-flex items-center gap-1 type-control-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            {item.action}
                            <IconArrowRight size={13} className="transition-transform duration-[120ms] group-hover:translate-x-0.5" />
                          </span>
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </aside>
          </section>
        </div>
      </div>
    </div>
  );
}
