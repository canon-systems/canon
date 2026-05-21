'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  IconBrain,
  IconChevronLeft,
  IconChevronRight,
  IconFlag,
  IconLayoutDashboard,
  IconLogout,
  IconRadar,
  IconSettings,
  IconUsers,
} from '@tabler/icons-react';
import type { Session, User } from '@supabase/supabase-js';
import { cn } from './ui/utils';

interface NavigationProps {
  user: User | null;
  session: Session | null;
  onLogout: () => void;
}

const primaryNav = [
  { href: '/dashboard', label: 'Dashboard', icon: IconLayoutDashboard, exact: true },
  { href: '/new-hires', label: 'New Hires', icon: IconUsers, exact: false },
  { href: '/knowledge', label: 'Knowledge', icon: IconBrain, exact: false },
  { href: '/milestones', label: 'Milestones', icon: IconFlag, exact: false },
  { href: '/readiness', label: 'Readiness', icon: IconRadar, exact: false },
];

const secondaryNav = [
  { href: '/settings', label: 'Settings', icon: IconSettings, exact: false },
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
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  const userEmail = user?.email ?? 'User';
  const userInitials = userEmail
    .split('@')[0]
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U';

  const navLinkClass = (active: boolean) =>
    cn(
      'flex items-center gap-[9px] px-4 py-2 type-nav rounded-[6px] mx-2 my-px cursor-pointer transition-colors duration-[120ms]',
      collapsed && 'justify-center px-0',
      active
        ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] font-medium'
        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]'
    );

  return (
    <aside
      className={cn(
        'relative flex h-screen shrink-0 flex-col border-r py-5 transition-[width] duration-200 ease-out',
        collapsed ? 'w-[72px]' : 'w-[200px]'
      )}
      style={{
        backgroundColor: 'var(--bg-sidebar)',
        borderColor: 'var(--border-tertiary)',
      }}
    >
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={collapsed ? 'Expand Navigation' : 'Collapse Navigation'}
        title={collapsed ? 'Expand Navigation' : 'Collapse Navigation'}
        className="absolute right-[-14px] top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border bg-[var(--bg-primary)] text-[var(--text-secondary)] transition-colors duration-[120ms] hover:text-[var(--text-primary)]"
        style={{ borderColor: 'var(--border-tertiary)' }}
      >
        {collapsed ? <IconChevronRight size={15} /> : <IconChevronLeft size={15} />}
      </button>

      <div
        className={cn(
          'flex items-center gap-[9px] px-4 pb-5 border-b mb-3',
          collapsed && 'justify-center px-0'
        )}
        style={{ borderColor: 'var(--border-tertiary)' }}
      >
        <div
          className="w-7 h-7 rounded-[7px] flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'var(--canon-purple)' }}
        >
          <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" aria-hidden="true">
            <circle cx="8" cy="8" r="5" stroke="white" strokeWidth="1.5" />
            <circle cx="8" cy="8" r="2" fill="white" />
          </svg>
        </div>
        {!collapsed && (
          <span className="type-card-title" style={{ color: 'var(--text-primary)' }}>Canon</span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto">
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

        <div className="mt-3">
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

      <div className={cn('mt-auto pt-3 px-4 border-t', collapsed && 'px-0')} style={{ borderColor: 'var(--border-tertiary)' }}>
        <div className={cn('flex items-center gap-2', collapsed && 'flex-col')}>
          <div
            className="w-[26px] h-[26px] rounded-full flex items-center justify-center type-control-sm text-[var(--text-primary)] flex-shrink-0"
            style={{ backgroundColor: 'var(--canon-purple)' }}
          >
            {userInitials}
          </div>
          {!collapsed && (
            <span className="type-body truncate flex-1" style={{ color: 'var(--text-secondary)' }}>
              {userEmail}
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
