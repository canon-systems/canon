'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Code2,
  LayoutDashboard,
  BookOpen,
  HelpCircle,
  Settings,
  Layers3,
  Sparkles,
  Send,
  ChevronsLeft,
  BarChart3,
  FileText,
  LogOut,
  ChevronDown,
  Zap,
} from 'lucide-react';
import type { Session, User } from '@supabase/supabase-js';

interface NavigationProps {
  user: User | null;
  session: Session | null;
  onLogout: () => void;
}

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  matchPrefix?: boolean;
};

const navSections: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Workspace',
    items: [
      { href: '/', label: 'Home', icon: LayoutDashboard },
      { href: '/overview', label: 'Overview', icon: BarChart3 },
      { href: '/logs', label: 'Logs', icon: FileText },
      { href: '/documentation', label: 'Generate', icon: Zap, matchPrefix: true },
      { href: '/edit', label: 'Edit & review', icon: Layers3, matchPrefix: true },
    ],
  },
  {
    title: 'Resources',
    items: [
      { href: '/docs', label: 'Docs', icon: BookOpen },
      { href: '/help', label: 'Help center', icon: HelpCircle },
      { href: '/settings', label: 'Settings', icon: Settings, matchPrefix: true },
    ],
  },
];

export function Navigation({ user, session, onLogout }: NavigationProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [generateMenuOpen, setGenerateMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const generateMenuRef = useRef<HTMLDivElement>(null);

  function isActive(item: NavItem) {
    if (item.matchPrefix) {
      // Special handling for Generate: active on /documentation or /architecture
      if (item.href === '/documentation') {
        return pathname.startsWith('/documentation') || pathname.startsWith('/architecture');
      }
      return pathname.startsWith(item.href);
    }
    return pathname === item.href;
  }

  const initials = user?.email?.[0]?.toUpperCase() ?? 'C';

  // Close user menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuOpen && userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }

    if (userMenuOpen) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [userMenuOpen]);

  // Close menu when navigation is collapsed
  useEffect(() => {
    if (collapsed && userMenuOpen) {
      setUserMenuOpen(false);
    }
    if (collapsed && generateMenuOpen) {
      setGenerateMenuOpen(false);
    }
  }, [collapsed, userMenuOpen, generateMenuOpen]);

  // Close generate menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (generateMenuOpen && generateMenuRef.current && !generateMenuRef.current.contains(event.target as Node)) {
        setGenerateMenuOpen(false);
      }
    }

    if (generateMenuOpen) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [generateMenuOpen]);

  return (
    <aside className="nav-rail" data-collapsed={collapsed}>
      <Link href="/" className="nav-rail__brand" aria-label="CodeSense home">
        <span className="nav-rail__brand-badge">
              <Code2 className="h-5 w-5 text-white" />
        </span>
        <div>
          <h1>CodeSense</h1>
          <p>INTEL</p>
            </div>
          </Link>

      <div className="nav-rail__menu">
        {navSections.map((section) => (
          <div key={section.title} className="nav-rail__section">
            <span className="nav-rail__section-title">{section.title}</span>
            {section.items.map((item) => {
              const Icon = item.icon;
              
              // Special handling for Generate menu
              if (item.href === '/documentation' && item.label === 'Generate') {
                const isGenerateActive = pathname.startsWith('/documentation') || pathname.startsWith('/architecture');
                return (
                  <div key={item.href} className="relative" ref={generateMenuRef}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setGenerateMenuOpen(!generateMenuOpen);
                      }}
                      className="nav-item w-full cursor-pointer text-left"
                      data-active={isGenerateActive}
                      aria-expanded={generateMenuOpen}
                      aria-haspopup="true"
                      title={collapsed ? item.label : undefined}
                      aria-label={collapsed ? item.label : undefined}
                    >
                      <Icon aria-hidden="true" />
                      {!collapsed && (
                        <>
                          <span className="flex-1">{item.label}</span>
                          <ChevronDown
                            className={`h-4 w-4 text-white/60 transition-transform flex-shrink-0 ${generateMenuOpen ? 'rotate-180' : ''}`}
                            aria-hidden="true"
                          />
                        </>
                      )}
                    </button>
                    {generateMenuOpen && !collapsed && (
                      <div
                        className="absolute top-full left-0 mt-1 w-full min-w-[180px] rounded-lg border border-white/20 bg-black/95 p-1 shadow-xl backdrop-blur-md z-50"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link
                          href="/documentation"
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-white/90 transition-colors hover:bg-white/10"
                          onClick={() => setGenerateMenuOpen(false)}
                          data-active={pathname.startsWith('/documentation')}
                        >
                          <Send className="h-4 w-4" />
                          Documentation
                        </Link>
                        <Link
                          href="/architecture"
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-white/90 transition-colors hover:bg-white/10"
                          onClick={() => setGenerateMenuOpen(false)}
                          data-active={pathname.startsWith('/architecture')}
                        >
                          <Sparkles className="h-4 w-4" />
                          Architecture
                        </Link>
                      </div>
                    )}
                  </div>
                );
              }
              
              // Regular navigation items
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="nav-item"
                  data-active={isActive(item)}
                  aria-current={isActive(item) ? 'page' : undefined}
                  title={collapsed ? item.label : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  >
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div className="nav-rail__footer">
        {session && user ? (
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setUserMenuOpen(!userMenuOpen);
              }}
              className="nav-rail__user w-full cursor-pointer hover:bg-white/10 transition-colors"
              aria-expanded={userMenuOpen}
              aria-haspopup="true"
            >
              <span className="nav-rail__user-avatar" aria-hidden="true">
                {initials}
              </span>
              {!collapsed && (
                <>
                  <div className="flex flex-1 flex-col">
                    <strong className="text-sm font-medium text-white">
                      {user?.user_metadata?.full_name ?? 'Workspace Member'}
                    </strong>
                    <span className="text-xs text-white/60">{user?.email}</span>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 text-white/60 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </>
              )}
            </button>
            {userMenuOpen && !collapsed && (
              <div
                className="absolute bottom-full left-0 mb-2 w-full rounded-lg border border-white/20 bg-black/95 p-1 shadow-xl backdrop-blur-md z-50"
                onClick={(e) => e.stopPropagation()}
              >
                <Link
                  href="/settings"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-white/90 transition-colors hover:bg-white/10"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setUserMenuOpen(false);
                    onLogout();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            )}
          </div>
        ) : (
          <Link href="/login" className="btn btn-secondary">
            Login / Sign up
          </Link>
        )}

        <button
          type="button"
          className="nav-rail__collapse"
          onClick={() => setCollapsed((prev) => !prev)}
          aria-pressed={collapsed}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          <ChevronsLeft aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}

