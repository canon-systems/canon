'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  IconBrain,
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
      'flex items-center gap-[9px] px-4 py-2 text-[13px] rounded-[6px] mx-2 my-px cursor-pointer transition-colors duration-[120ms]',
      active
        ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] font-medium'
        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]'
    );

  return (
    <aside
      className="flex h-screen w-[200px] shrink-0 flex-col border-r py-5"
      style={{
        backgroundColor: 'var(--bg-sidebar)',
        borderColor: 'var(--border-tertiary)',
      }}
    >
      <div
        className="flex items-center gap-[9px] px-4 pb-5 border-b mb-3"
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
        <span className="text-[15px] font-medium" style={{ color: 'var(--text-primary)' }}>Canon</span>
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
              >
                <Icon size={15} />
                {item.label}
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
              >
                <Icon size={15} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="mt-auto pt-3 px-4 border-t" style={{ borderColor: 'var(--border-tertiary)' }}>
        <div className="flex items-center gap-2">
          <div
            className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[10px] font-medium text-[var(--text-primary)] flex-shrink-0"
            style={{ backgroundColor: 'var(--canon-purple)' }}
          >
            {userInitials}
          </div>
          <span className="text-[12px] truncate flex-1" style={{ color: 'var(--text-secondary)' }}>
            {userEmail}
          </span>
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
