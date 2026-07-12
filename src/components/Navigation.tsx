'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Brain as IconBrain,
  ChevronLeft as IconChevronLeft,
  ChevronRight as IconChevronRight,
  Flag as IconFlag,
  House as IconHome2,
  LogOut as IconLogout,
  Radar as IconRadar,
  Settings as IconSettings,
  Users as IconUsers,
} from 'lucide-react';
import type { Session, User } from '@supabase/supabase-js';
import { cn } from './ui/utils';
import { initialsForName, userFullName } from '@/lib/userDisplay';

interface NavigationProps {
  user: User | null;
  session: Session | null;
  onLogout: () => void;
}

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

export function Navigation({ user, onLogout }: NavigationProps) {
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

  const displayName = userFullName(user);
  const userEmail = user?.email ?? '';
  const userInitials = initialsForName(displayName);

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

      <div className={cn('surface-divider mt-auto pt-3 px-4 border-t', collapsed && 'px-0')}>
        <div className={cn('flex items-center gap-2', collapsed && 'flex-col')}>
          <div
            className="w-[26px] h-[26px] rounded-full flex items-center justify-center type-control-sm text-[var(--text-primary)] flex-shrink-0"
            style={{ backgroundColor: 'var(--canon-purple)' }}
          >
            {userInitials}
          </div>
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate type-body" style={{ color: 'var(--text-secondary)' }}>
                {displayName}
              </span>
              {userEmail && (
                <span className="block truncate type-caption" style={{ color: 'var(--text-tertiary)' }}>
                  {userEmail}
                </span>
              )}
            </span>
          )}
          <button
            type="button"
            onClick={onLogout}
            aria-label="Log Out"
            title="Log Out"
            className="w-7 h-7 rounded-md border border-[var(--border-tertiary)] bg-transparent flex items-center justify-center cursor-pointer text-[var(--text-tertiary)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)] transition-colors duration-[120ms]"
          >
            <IconLogout size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
