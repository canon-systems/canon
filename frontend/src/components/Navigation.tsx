'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Database,
  Target,
  Settings,
  BookOpen,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { Session, User } from '@supabase/supabase-js';
import { cn } from './ui/utils';

interface NavigationProps {
  user: User | null;
  session: Session | null;
  onLogout: () => void;
}

const primaryNav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/new-hires', label: 'New Hires', icon: Users, exact: false },
  { href: '/knowledge', label: 'Knowledge', icon: Database, exact: false },
  { href: '/milestones', label: 'Milestones', icon: Target, exact: false },
];

const secondaryNav = [
  { href: '/settings', label: 'Settings', icon: Settings, exact: false },
  { href: '/docs', label: 'Docs', icon: BookOpen, exact: false },
];

export function Navigation({ user, onLogout }: NavigationProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('canon-nav-collapsed');
    if (saved === 'true') setCollapsed(true);
  }, []);

  useEffect(() => {
    if (mounted) localStorage.setItem('canon-nav-collapsed', String(collapsed));
  }, [collapsed, mounted]);

  const isActive = (href: string, exact = false) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  const toggle = () => setCollapsed((v) => !v);

  const navLinkClass = (active: boolean) =>
    cn(
      'flex items-center rounded-lg py-2 text-sm transition-colors',
      collapsed ? 'justify-center px-0' : 'gap-3 px-3',
      active ? 'bg-white/10 text-white font-medium' : 'text-white/60 hover:bg-white/5 hover:text-white/90'
    );

  const iconClass = (active: boolean) =>
    cn('h-4 w-4 shrink-0', active ? 'text-white' : 'text-white/40');

  return (
    <aside
      className={cn(
        'flex h-screen shrink-0 flex-col border-r border-white/[0.08] bg-zinc-900 transition-all duration-200',
        collapsed ? 'w-14' : 'w-60'
      )}
    >
      {/* Brand header */}
      <div
        className={cn(
          'flex items-center border-b border-white/[0.08]',
          collapsed ? 'justify-center px-0 py-5' : 'justify-between px-4 py-5'
        )}
      >
        <div className={cn('flex items-center', collapsed ? '' : 'gap-3')}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-zinc-800">
            <Image
              src="/web-app-manifest-512x512.png"
              alt="Canon"
              width={20}
              height={20}
              className="rounded"
            />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-white">Canon</span>
              <span className="text-[10px] uppercase tracking-widest text-white/40">Onboarding Agent</span>
            </div>
          )}
        </div>

        {!collapsed && (
          <button
            onClick={toggle}
            title="Collapse sidebar"
            className="rounded p-1 text-white/30 hover:bg-white/5 hover:text-white/70 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-4">
        <div className="space-y-0.5">
          {primaryNav.map((item) => {
            const active = isActive(item.href, item.exact);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={navLinkClass(active)}
              >
                <Icon className={iconClass(active)} />
                {!collapsed && item.label}
              </Link>
            );
          })}
        </div>

        <div className="my-3 border-t border-white/[0.08]" />

        <div className="space-y-0.5">
          {secondaryNav.map((item) => {
            const active = isActive(item.href, item.exact);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={navLinkClass(active)}
              >
                <Icon className={iconClass(active)} />
                {!collapsed && item.label}
              </Link>
            );
          })}
        </div>

        {/* Expand button when collapsed */}
        {collapsed && (
          <>
            <div className="my-3 border-t border-white/[0.08]" />
            <button
              onClick={toggle}
              title="Expand sidebar"
              className="flex w-full items-center justify-center rounded-lg py-2 text-white/30 hover:bg-white/5 hover:text-white/70 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="border-t border-white/[0.08] px-2 py-3">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div
              title={user?.email}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white"
            >
              {user?.email?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <button
              onClick={onLogout}
              title="Log out"
              className="rounded p-1 text-white/30 hover:text-white/70 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">
              {user?.email?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-xs font-medium text-white">
                {user?.user_metadata?.full_name as string | undefined ?? user?.email?.split('@')[0] ?? 'User'}
              </span>
              <span className="truncate text-[10px] text-white/40">{user?.email}</span>
            </div>
            <button
              onClick={onLogout}
              aria-label="Log out"
              className="shrink-0 rounded p-1 text-white/30 hover:text-white/70 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
