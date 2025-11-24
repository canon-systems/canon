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
  Github,
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
      { href: '/edit', label: 'Edit', icon: Layers3, matchPrefix: true },
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
  const [editMenuOpen, setEditMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const generateMenuRef = useRef<HTMLDivElement>(null);
  const editMenuRef = useRef<HTMLDivElement>(null);

  function isActive(item: NavItem) {
    if (item.matchPrefix) {
      // Special handling for Generate: active on /documentation or /architecture (including /architecture/manage)
      if (item.href === '/documentation') {
        return pathname.startsWith('/documentation') || pathname.startsWith('/architecture');
      }
      // Special handling for Edit: active on /edit or /architecture/manage
      if (item.href === '/edit') {
        return pathname.startsWith('/edit') || pathname.startsWith('/architecture/manage');
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

  // Close menu when navigation is collapsed (except user menu which should remain accessible)
  useEffect(() => {
    if (collapsed && generateMenuOpen) {
      setGenerateMenuOpen(false);
    }
    if (collapsed && editMenuOpen) {
      setEditMenuOpen(false);
    }
  }, [collapsed, generateMenuOpen, editMenuOpen]);

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

  // Close edit menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (editMenuOpen && editMenuRef.current && !editMenuRef.current.contains(event.target as Node)) {
        setEditMenuOpen(false);
      }
    }

    if (editMenuOpen) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [editMenuOpen]);

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
                      <div className="mt-1 space-y-0.5">
                        <Link
                          href="/documentation"
                          className="nav-item ml-8 text-sm"
                          onClick={() => setGenerateMenuOpen(false)}
                          data-active={pathname.startsWith('/documentation')}
                        >
                          <Send className="h-4 w-4" />
                          <span>Documentation</span>
                        </Link>
                        <Link
                          href="/architecture"
                          className="nav-item ml-8 text-sm"
                          onClick={() => setGenerateMenuOpen(false)}
                          data-active={pathname.startsWith('/architecture') && !pathname.startsWith('/architecture/manage')}
                        >
                          <Sparkles className="h-4 w-4" />
                          <span>Architecture</span>
                        </Link>
                        <Link
                          href="/architecture/manage"
                          className="nav-item ml-8 text-sm"
                          onClick={() => setGenerateMenuOpen(false)}
                          data-active={pathname.startsWith('/architecture/manage')}
                        >
                          <Layers3 className="h-4 w-4" />
                          <span>Manage</span>
                        </Link>
                      </div>
                    )}
                  </div>
                );
              }

              // Special handling for Edit menu
              if (item.href === '/edit' && item.label === 'Edit') {
                const isEditActive = pathname.startsWith('/edit') || pathname.startsWith('/architecture/manage');
                return (
                  <div key={item.href} className="relative" ref={editMenuRef}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditMenuOpen(!editMenuOpen);
                      }}
                      className="nav-item w-full cursor-pointer text-left"
                      data-active={isEditActive}
                      aria-expanded={editMenuOpen}
                      aria-haspopup="true"
                      title={collapsed ? item.label : undefined}
                      aria-label={collapsed ? item.label : undefined}
                    >
                      <Icon aria-hidden="true" />
                      {!collapsed && (
                        <>
                          <span className="flex-1">{item.label}</span>
                          <ChevronDown
                            className={`h-4 w-4 text-white/60 transition-transform flex-shrink-0 ${editMenuOpen ? 'rotate-180' : ''}`}
                            aria-hidden="true"
                          />
                        </>
                      )}
                    </button>
                    {editMenuOpen && !collapsed && (
                      <div className="mt-1 space-y-0.5">
                        <Link
                          href="/edit"
                          className="nav-item ml-8 text-sm"
                          onClick={() => setEditMenuOpen(false)}
                          data-active={pathname.startsWith('/edit')}
                        >
                          <FileText className="h-4 w-4" />
                          <span>Documentation</span>
                        </Link>
                        <Link
                          href="/architecture/manage"
                          className="nav-item ml-8 text-sm"
                          onClick={() => setEditMenuOpen(false)}
                          data-active={pathname.startsWith('/architecture/manage')}
                        >
                          <Layers3 className="h-4 w-4" />
                          <span>Architecture</span>
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

