'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  BookOpen,
  FileText,
  Github,
  Layers3,
  LogOut,
  Menu,
  ScrollText,
  Settings,
  Zap,
} from 'lucide-react';
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
  icon: typeof FileText;
  matchPrefix?: boolean;
};

const primaryNav: NavItem[] = [
  { href: '/overview', label: 'Overview', icon: Activity },
  { href: '/repos', label: 'Repos', icon: Github },
  { href: '/documentation', label: 'Docs', icon: FileText },
  { href: '/architecture-diagrams', label: 'Architecture', icon: Layers3 },
  { href: '/automation', label: 'Automation', icon: Zap },
  { href: '/logs', label: 'Logs', icon: ScrollText },
];

const secondaryNav: NavItem[] = [
  { href: '/logs', label: 'Activity', icon: Activity },
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

  const navLinkClass = (active: boolean) =>
    cn(
      'flex items-center gap-2 rounded-full px-3 py-2 text-sm transition border border-transparent',
      active
        ? 'bg-white text-black shadow-[0_10px_30px_rgba(255,255,255,0.12)]'
        : 'bg-white/0 text-white/80 hover:bg-white/10 hover:border-white/10 hover:text-white'
    );

  return (
    <div className="sticky top-0 z-40 border-b border-white/10 bg-black/70 backdrop-blur-xl" ref={containerRef}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.08),transparent_60%)]" />
      <nav className="relative mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/5 px-3 py-2 transition hover:border-white/10 hover:bg-white/10">
          <img
            src="/web-app-manifest-512x512.png"
            alt="Canon AI docs & automation"
            className="h-10 w-10 rounded-lg border border-white/10"
          />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-white">Canon</span>
            <span className="text-[11px] uppercase tracking-[0.2em] text-white/60">Workspace</span>
          </div>
        </Link>

        <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-2 shadow-inner shadow-black/30 lg:flex">
          {primaryNav.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={navLinkClass(active)}>
                <Icon className={cn('h-4 w-4', active ? 'text-black/70' : 'text-white/70')} />
                <span className={active ? 'text-black/80' : 'text-white/90'}>{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-white/80 transition hover:border-white/20 hover:bg-white/10"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black font-semibold">
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

        <div className="flex items-center gap-2 lg:hidden">
          <Button variant="secondary" className="h-10 w-10 rounded-full border-white/10 bg-white/5" onClick={() => setMobileOpen((v) => !v)}>
            <Menu className="h-4 w-4 text-white" />
          </Button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="relative border-t border-white/10 bg-black/85 px-4 py-4 backdrop-blur-xl lg:hidden">
          <div className="grid gap-2">
            {primaryNav.map((item) => {
              const active = isActive(item);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border border-white/10 px-3 py-3 text-sm text-white/90 transition',
                    active ? 'bg-white/10' : 'bg-white/5 hover:bg-white/10'
                  )}
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon className="h-4 w-4 text-white/70" />
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
                    'flex items-center gap-3 rounded-xl border border-white/10 px-3 py-3 text-sm text-white/80 transition',
                    active ? 'bg-white/10' : 'bg-white/5 hover:bg-white/10'
                  )}
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon className="h-4 w-4 text-white/60" />
                  {item.label}
                </Link>
              );
            })}
          </div>
          {session && user && (
            <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white/80">
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
