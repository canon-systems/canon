'use client';

import { useEffect, useState } from 'react';
import { Show, SignInButton, SignUpButton, UserButton, useOrganization, useOrganizationList } from '@clerk/nextjs';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowRight as IconArrowRight,
  Brain as IconBrain,
  Building2 as IconBuilding,
  Check as IconCheck,
  ChevronDown as IconChevronDown,
  ChevronLeft as IconChevronLeft,
  ChevronRight as IconChevronRight,
  ExternalLink as IconExternalLink,
  Flag as IconFlag,
  House as IconHome2,
  Radar as IconRadar,
  Settings as IconSettings,
  Users as IconUsers,
} from 'lucide-react';
import { cn } from './ui/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { CLERK_SIGN_IN_BUTTON_PROPS, CLERK_SIGN_UP_BUTTON_PROPS } from '@/lib/clerk-config';
import { AUTH_ROUTES } from '@/lib/clerk-routes';
import {
  configuredDemoWorkspaceUrl,
  isDemoWorkspaceOrganization,
  summarizeWorkspaceMemberships,
  type WorkspaceMembershipLike,
} from '@/lib/workspace-access';

const primaryNav = [
  { href: '/', label: 'Home', icon: IconHome2, exact: true },
  { href: '/new-hires', label: 'Hire Paths', icon: IconUsers, exact: false },
  { href: '/milestones', label: 'Milestones', icon: IconFlag, exact: false },
  { href: '/readiness', label: 'Readiness', icon: IconRadar, exact: false },
];

const secondaryNav = [
  { href: '/knowledge', label: 'Knowledge', icon: IconBrain, exact: false },
  { href: '/settings?tab=org', label: 'Settings', icon: IconSettings, exact: false },
];

export function Navigation() {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoaded: organizationLoaded, organization } = useOrganization();
  const { setActive, userMemberships } = useOrganizationList({
    userMemberships: {
      pageSize: 100,
      keepPreviousData: true,
    },
  });
  const [collapsed, setCollapsed] = useState(false);
  const [switchingWorkspaceId, setSwitchingWorkspaceId] = useState<string | null>(null);
  const demoWorkspaceUrl = configuredDemoWorkspaceUrl();
  const isExternalDemoWorkspace = demoWorkspaceUrl.startsWith('http://') || demoWorkspaceUrl.startsWith('https://');
  const membershipData = Array.isArray(userMemberships.data)
    ? userMemberships.data as WorkspaceMembershipLike[]
    : [];
  const { realWorkspaces, demoWorkspaces } = summarizeWorkspaceMemberships(membershipData);
  const activeWorkspaceIsDemo = organization
    ? isDemoWorkspaceOrganization(organization)
    : false;
  const realWorkspace = realWorkspaces.find((workspace) => workspace.clerkOrgId !== organization?.id) ?? realWorkspaces[0] ?? null;
  const demoWorkspace = demoWorkspaces.find((workspace) => workspace.clerkOrgId !== organization?.id) ?? demoWorkspaces[0] ?? null;
  const switchTarget = activeWorkspaceIsDemo ? realWorkspace : demoWorkspace;
  const switchTargetLabel = activeWorkspaceIsDemo ? 'Team workspace' : 'Demo workspace';
  const switchTargetCaption = activeWorkspaceIsDemo ? realWorkspace?.name : demoWorkspace?.name;
  const showDemoWorkspaceLink = Boolean(demoWorkspaceUrl && !demoWorkspace && !activeWorkspaceIsDemo);
  const workspaceName = organizationLoaded
    ? organization?.name ?? 'No workspace selected'
    : 'Loading workspace';

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

  async function switchWorkspace(clerkOrgId: string) {
    if (!setActive || switchingWorkspaceId) return;

    setSwitchingWorkspaceId(clerkOrgId);
    try {
      await setActive({ organization: clerkOrgId });
      router.replace(AUTH_ROUTES.afterSignIn);
      router.refresh();
    } finally {
      setSwitchingWorkspaceId(null);
    }
  }

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
          <span className="flex min-w-0 items-center gap-2">
            <span className="type-panel-title" style={{ color: 'var(--text-primary)' }}>Canon</span>
            {activeWorkspaceIsDemo && (
              <span className="rounded-full bg-[var(--canon-purple-light)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--canon-purple)]">
                Demo
              </span>
            )}
          </span>
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-[7px] border border-[var(--border-tertiary)] bg-[var(--bg-primary)] px-3 py-2 text-left transition-colors duration-[120ms] hover:bg-[var(--bg-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--canon-purple)]/30"
                    aria-label="Open workspace menu"
                  >
                    <IconBuilding size={14} className="shrink-0 text-[var(--text-tertiary)]" />
                    <div className="min-w-0 flex-1">
                      <div className="type-caption">Workspace</div>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="type-field truncate text-[var(--text-primary)]">{workspaceName}</span>
                        {activeWorkspaceIsDemo && (
                          <span className="shrink-0 rounded-full bg-[var(--canon-purple-light)] px-1.5 py-px text-[8px] font-semibold uppercase tracking-[0.08em] text-[var(--canon-purple)]">
                            Demo
                          </span>
                        )}
                      </div>
                    </div>
                    <IconChevronDown size={13} className="shrink-0 text-[var(--text-tertiary)]" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top">
                  <div className="px-2 py-2">
                    <div className="type-caption">Current workspace</div>
                    <div className="mt-1 flex min-w-0 items-center gap-2">
                      <IconCheck size={13} className="shrink-0 text-[var(--canon-purple)]" />
                      <span className="type-field truncate text-[var(--text-primary)]">{workspaceName}</span>
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  {switchTarget && (
                    <DropdownMenuItem
                      onSelect={() => void switchWorkspace(switchTarget.clerkOrgId)}
                      disabled={Boolean(switchingWorkspaceId) || !setActive}
                    >
                      <IconBuilding size={13} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[var(--text-primary)]">
                          {switchingWorkspaceId === switchTarget.clerkOrgId ? 'Opening...' : switchTargetLabel}
                        </span>
                        {switchTargetCaption && (
                          <span className="block truncate type-caption">{switchTargetCaption}</span>
                        )}
                      </span>
                      <IconArrowRight size={12} className="text-[var(--text-tertiary)]" />
                    </DropdownMenuItem>
                  )}
                  {showDemoWorkspaceLink && (
                    <DropdownMenuItem asChild>
                      <Link
                        href={demoWorkspaceUrl}
                        target={isExternalDemoWorkspace ? '_blank' : undefined}
                        rel={isExternalDemoWorkspace ? 'noreferrer' : undefined}
                      >
                        <IconBuilding size={13} />
                        <span className="min-w-0 flex-1 truncate">Demo workspace</span>
                        <IconExternalLink size={12} className="text-[var(--text-tertiary)]" />
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {!switchTarget && !showDemoWorkspaceLink && (
                    <DropdownMenuItem disabled>
                      No alternate workspace available
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <UserButton userProfileMode="modal" />
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
