'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Code2,
  LayoutDashboard,
  BookOpen,
  Settings,
  Layers3,
  ChevronsLeft,
  BarChart3,
  FileText,
  LogOut,
  ChevronDown,
  Zap,
  Github,
  Activity,
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
    title: 'Get Started',
    items: [
      { href: '/repos', label: 'Connect Repos', icon: Github },
    ],
  },
  {
    title: 'Create',
    items: [
      { href: '/documentation', label: 'Generate Docs', icon: FileText },
    ],
  },
  {
    title: 'Manage',
    items: [
      { href: '/edit', label: 'Edit Documents', icon: BookOpen, matchPrefix: true },
      { href: '/automation', label: 'Automation', icon: Zap },
    ],
  },
  {
    title: 'Overview',
    items: [
      { href: '/overview', label: 'Dashboard', icon: BarChart3 },
      { href: '/logs', label: 'Activity', icon: Activity },
    ],
  },
  {
    title: 'Resources',
    items: [
      { href: '/docs', label: 'Video Tutorials', icon: BookOpen },
      { href: '/settings', label: 'Settings', icon: Settings, matchPrefix: true },
    ],
  },
];

export function Navigation({ user, session, onLogout }: NavigationProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  function isActive(item: NavItem) {
    if (item.matchPrefix) {
      return pathname.startsWith(item.href);
    }
    return pathname === item.href;
  }

  const initials = user?.email?.[0]?.toUpperCase() ?? 'C';

  // Handle responsive behavior
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);

      // Auto-collapse on mobile, auto-expand on desktop
      if (mobile && !collapsed) {
        setCollapsed(true);
      } else if (!mobile && collapsed) {
        setCollapsed(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, [collapsed]);

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


  return (
    <aside className="nav-rail" data-collapsed={collapsed}>
      <Link href="/" className="nav-rail__brand" aria-label="Sync home">
        <span className="nav-rail__brand-badge">
          <Code2 className="h-5 w-5 text-white" />
        </span>
        <div>
          <h1>Sync</h1>
          <p>INTEL</p>
        </div>
      </Link>

      <div className="nav-rail__menu">
        {navSections.map((section) => (
          <div key={section.title} className="nav-rail__section">
            <span className="nav-rail__section-title">{section.title}</span>
            {section.items.map((item) => {
              const Icon = item.icon;

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
        <div className="relative" ref={userMenuRef}>
          {session && user ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setUserMenuOpen(!userMenuOpen);
                }}
                className="nav-rail__user w-full cursor-pointer hover:bg-white/10 transition-colors"
                aria-expanded={userMenuOpen}
                aria-haspopup="true"
                title={collapsed ? `${user?.user_metadata?.full_name ?? 'Workspace Member'} - ${user?.email}` : undefined}
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
              {userMenuOpen && (
                <div
                  className={`absolute ${collapsed ? 'bottom-full left-0 mb-2 w-64' : 'bottom-full left-0 mb-2 w-full'} rounded-lg border border-white/20 bg-black/95 p-1 shadow-xl backdrop-blur-md z-50`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {collapsed && (
                    <div className="px-3 py-2 border-b border-white/10 mb-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="nav-rail__user-avatar text-sm">{initials}</span>
                        <div className="flex flex-col">
                          <strong className="text-sm font-medium text-white">
                            {user?.user_metadata?.full_name ?? 'Workspace Member'}
                          </strong>
                          <span className="text-xs text-white/60">{user?.email}</span>
                        </div>
                      </div>
                    </div>
                  )}
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
                    className="user-menu-button flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-white/90 transition-colors border-0 bg-transparent text-left outline-none focus:outline-none"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <Link
                href="/login"
                className={`nav-rail__user w-full ${collapsed ? 'justify-center' : ''}`}
                title={collapsed ? 'Login / Sign up' : undefined}
              >
                <span className="nav-rail__user-avatar" aria-hidden="true">
                  ?
                </span>
                {!collapsed && (
                  <div className="flex flex-1 flex-col">
                    <strong className="text-sm font-medium text-white">
                      Not signed in
                    </strong>
                    <span className="text-xs text-white/60">Click to login</span>
                  </div>
                )}
              </Link>
            </>
          )}
        </div>

        {!isMobile && (
          <button
            type="button"
            className="nav-rail__collapse"
            onClick={() => setCollapsed((prev) => !prev)}
            aria-pressed={collapsed}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            <ChevronsLeft aria-hidden="true" />
          </button>
        )}
      </div>
    </aside>
  );
}

