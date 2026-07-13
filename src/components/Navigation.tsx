'use client';

import { useEffect, useState } from 'react';
import { OrganizationSwitcher, Show, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Brain as IconBrain,
  ChevronLeft as IconChevronLeft,
  ChevronRight as IconChevronRight,
  Flag as IconFlag,
  House as IconHome2,
  Radar as IconRadar,
  Settings as IconSettings,
  Users as IconUsers,
} from 'lucide-react';
import { cn } from './ui/utils';
import { CLERK_SIGN_IN_BUTTON_PROPS, CLERK_SIGN_UP_BUTTON_PROPS } from '@/lib/clerk-config';
import { AUTH_ROUTES } from '@/lib/clerk-routes';

const primaryNav = [
  { href: '/', label: 'Home', icon: IconHome2, exact: true },
  { href: '/new-hires', label: 'Hire Paths', icon: IconUsers, exact: false },
  { href: '/milestones', label: 'Milestones', icon: IconFlag, exact: false },
  { href: '/readiness', label: 'Readiness', icon: IconRadar, exact: false },
];

const secondaryNav = [
  { href: '/knowledge', label: 'Knowledge', icon: IconBrain, exact: false },
  { href: '/settings?tab=profile', label: 'Settings', icon: IconSettings, exact: false },
];

export function Navigation() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setCollapsed(window.localStorage.getItem('canon-nav-collapsed') === 'true');
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('canon-nav-collapsed', String(next));
      }
      return next;
    });
  }

  const isActive = (href: string, exact = false) => {
    const hrefPath = href.split('?')[0] || href;
    if (exact) return pathname === hrefPath;
    return pathname.startsWith(hrefPath);
  };

  const navLinkClass = (active: boolean) =>
    cn(
      'flex items-center gap-[9px] px-4 py-2 type-nav rounded-[6px] mx-2 my-px cursor-pointer transition-colors duration-[120ms]',
      collapsed && 'justify-center px-0',
      active
        ? 'nav-item-selected font-medium border'
        : 'border border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)] hover:border-[var(--border-tertiary)]'
    );

  return (
    <aside
      className={cn(
        'surface-sidebar relative flex h-screen shrink-0 flex-col border-r py-3 transition-[width] duration-200 ease-out',
        collapsed ? 'w-[72px]' : 'w-[200px]'
      )}
    >
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={collapsed ? 'Expand Navigation' : 'Collapse Navigation'}
        title={collapsed ? 'Expand Navigation' : 'Collapse Navigation'}
        className="surface-panel absolute right-[-10px] top-1/2 z-20 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border text-[var(--text-secondary)] transition-colors duration-[120ms] hover:text-[var(--text-primary)]"
      >
        {collapsed ? <IconChevronRight size={11} /> : <IconChevronLeft size={11} />}
      </button>

      <Link
        href="/"
        className={cn(
          'app-brand flex items-center gap-[9px]',
          collapsed && 'justify-center'
        )}
        title={collapsed ? 'Canon' : undefined}
      >
        <span className="app-brand-mark flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[8px] overflow-hidden">
          <Image
            src="/web-app-manifest-512x512.png"
            alt="Canon"
            width={24}
            height={24}
            className="h-6 w-6"
            priority
          />
        </span>
        {!collapsed && (
          <span className="type-panel-title" style={{ color: 'var(--text-primary)' }}>Canon</span>
        )}
      </Link>

      <nav className="flex flex-1 flex-col overflow-y-auto">
        <div>
          {primaryNav.map((item) => {
            const active = isActive(item.href, item.exact);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={navLinkClass(active)}
                title={collapsed ? item.label : undefined}
              >
                <Icon size={15} />
                {!collapsed && item.label}
              </Link>
            );
          })}
        </div>

        <div className="mt-auto pt-3">
          {secondaryNav.map((item) => {
            const active = isActive(item.href, item.exact);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={navLinkClass(active)}
                title={collapsed ? item.label : undefined}
              >
                <Icon size={15} />
                {!collapsed && item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className={cn('surface-divider mt-auto border-t px-4 pt-3', collapsed && 'px-0')}>
        <div className={cn('flex items-center gap-2', collapsed && 'flex-col')}>
          <Show when="signed-in">
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <OrganizationSwitcher
                  createOrganizationUrl={AUTH_ROUTES.createOrganization}
                  afterCreateOrganizationUrl={AUTH_ROUTES.afterSignIn}
                  afterSelectOrganizationUrl={AUTH_ROUTES.afterSignIn}
                  appearance={{
                    elements: {
                      organizationSwitcherTrigger:
                        'max-w-full border border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-none',
                    },
                  }}
                />
              </div>
            )}
            <UserButton />
          </Show>
          <Show when="signed-out">
            {!collapsed && (
              <div className="flex min-w-0 flex-1 gap-2">
                <SignInButton {...CLERK_SIGN_IN_BUTTON_PROPS}>
                  <button className="h-8 rounded-[6px] border border-[var(--border-tertiary)] px-3 type-field text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]">
                    Sign in
                  </button>
                </SignInButton>
                <SignUpButton {...CLERK_SIGN_UP_BUTTON_PROPS}>
                  <button className="h-8 rounded-[6px] bg-[var(--canon-purple)] px-3 type-field text-[var(--text-on-accent)]">
                    Sign up
                  </button>
                </SignUpButton>
              </div>
            )}
          </Show>
        </div>
      </div>
    </aside>
  );
}
