'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  Activity,
  BookOpen,
  History,
  Layers,
  LogOut,
  Menu,
  Radio,
  Settings,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Session, User } from '@supabase/supabase-js';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { cn } from './ui/utils';

interface NavigationProps {
  user: User | null;
  session: Session | null;
  onLogout: () => void;
}

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  matchPrefix?: boolean;
};

const primaryNav: NavItem[] = [
  { href: '/sources', label: 'Sources', icon: Layers },
  { href: '/signals', label: 'Signals', icon: Radio, matchPrefix: true },
  { href: '/history', label: 'History', icon: History, matchPrefix: true },
  { href: '/logs', label: 'Logs', icon: Activity },
];

const secondaryNav: NavItem[] = [
  { href: '/settings', label: 'Settings', icon: Settings, matchPrefix: true },
  { href: '/docs', label: 'Tutorials', icon: BookOpen },
];

export function Navigation({ user, session, onLogout }: NavigationProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const initials = useMemo(() => user?.email?.[0]?.toUpperCase() ?? 'C', [user]);

  const isActive = (item: NavItem) => {
    if (item.matchPrefix) return pathname.startsWith(item.href);
    return pathname === item.href;
  };

  return (
    <div
      className="sticky top-0 z-40 border-b border-white/10 bg-white/[0.06] backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]"
      ref={containerRef}
    >
      <nav className="relative flex items-center justify-between px-4 py-4 md:px-6 lg:px-8">
        <Link
          href="/"
          className="group flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.04] px-3 py-2 transition hover:border-white/10 hover:bg-white/10 hover:shadow-[0_0_20px_rgba(255,255,255,0.03)]"
        >
          <div className="rounded-lg border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-0.5 transition group-hover:from-white/15 group-hover:to-white/10">
            <Image
              src="/web-app-manifest-512x512.png"
              alt="Canon AI docs & automation"
              width={40}
              height={40}
              className="h-10 w-10 rounded-lg border border-white/10"
            />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-white">Canon</span>
            <span className="text-[11px] uppercase tracking-[0.2em] text-white/60">Workspace</span>
          </div>
        </Link>

        <div className="hidden items-center gap-1 rounded-xl border border-white/5 bg-white/[0.02] px-2 py-1.5 lg:flex">
          {primaryNav.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200',
                  active
                    ? 'text-white'
                    : 'text-white/60 hover:bg-white/5 hover:text-white/90'
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-white' : 'text-white/50')} />
                {item.label}
                {active && (
                  <span
                    className="absolute bottom-1 left-4 right-4 h-px bg-white"
                    aria-hidden
                  />
                )}
              </Link>
            );
          })}
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                className="flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-left text-sm text-white/80 transition hover:border-white/20 hover:bg-white/10 hover:shadow-[0_0_20px_rgba(255,255,255,0.04)]"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-white to-white/90 text-black font-semibold shadow-[0_0_12px_rgba(255,255,255,0.15)]">
                  {initials}
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-white font-semibold">{user?.user_metadata?.full_name ?? 'Workspace Member'}</span>
                  <span className="text-xs text-white/60">{user?.email}</span>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-white/10 bg-black/90 backdrop-blur-xl">
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/docs">
                  <BookOpen className="mr-2 h-4 w-4" />
                  Tutorials
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-300 focus:bg-red-500/10"
                onClick={onLogout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex shrink-0 items-center gap-2 lg:hidden">
          <Button
            variant="secondary"
            className="h-11 min-h-11 w-11 min-w-11 shrink-0 rounded-full border border-white/10 bg-white/5 p-0 transition hover:border-white/15 hover:bg-white/10"
            onClick={() => setMobileOpen((v) => !v)}
          >
            <Menu className="h-5 w-5 shrink-0 text-white" />
          </Button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="relative border-t border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] lg:hidden">
          <div className="grid gap-2">
            {primaryNav.map((item) => {
              const active = isActive(item);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-3 py-3 text-sm transition',
                    active
                      ? 'border-white/15 bg-white/10 text-white'
                      : 'border-white/10 bg-white/5 text-white/90 hover:border-white/15 hover:bg-white/10'
                  )}
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon className={cn('h-4 w-4', active ? 'text-white' : 'text-white/70')} />
                  {item.label}
                </Link>
              );
            })}
          </div>
          <div className="mt-3 grid gap-2">
            {secondaryNav.map((item) => {
              const active = isActive(item);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-3 py-3 text-sm transition',
                    active
                      ? 'border-white/15 bg-white/10 text-white/90'
                      : 'border-white/10 bg-white/5 text-white/80 hover:border-white/15 hover:bg-white/10'
                  )}
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon className={cn('h-4 w-4', active ? 'text-white/80' : 'text-white/60')} />
                  {item.label}
                </Link>
              );
            })}
          </div>
          {session && user && (
            <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white/80">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black font-semibold">
                  {initials}
                </div>
                <div className="flex flex-col">
                  <span className="text-white font-semibold">{user?.user_metadata?.full_name ?? 'Workspace Member'}</span>
                  <span className="text-xs text-white/60">{user?.email}</span>
                </div>
              </div>
              <Button variant="ghost" className="text-red-300 hover:text-red-200" onClick={onLogout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
