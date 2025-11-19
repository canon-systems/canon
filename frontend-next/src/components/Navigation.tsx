'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Code2, Home, BookOpen, HelpCircle, Settings } from 'lucide-react';
import type { User, Session } from '@supabase/supabase-js';

interface NavigationProps {
  user: User | null;
  session: Session | null;
  onLogout: () => void;
}

export function Navigation({ user, session, onLogout }: NavigationProps) {
  const pathname = usePathname();

  return (
    <nav className="relative z-10 border-b border-white/10 bg-black/30 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="group flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/30 bg-white/20 bg-gradient-to-r from-gray-500 to-gray-700 backdrop-blur-sm transition-transform group-hover:scale-105">
              <Code2 className="h-5 w-5 text-white" />
            </div>
            <div className="text-white">
              <h1 className="text-xl font-bold">CodeSense</h1>
              <p className="text-xs text-white/80">Business Intelligence</p>
            </div>
          </Link>

          <div className="hidden items-center gap-4 md:flex">
            <div className="flex items-center gap-2">
              <Link href="/">
                <div
                  className={`flex items-center gap-2 rounded-full border border-transparent bg-white/5 px-4 py-2 text-white/80 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white ${
                    pathname === '/' ? 'border-white/20 bg-white/20 text-white' : ''
                  }`}
                >
                  <Home className="h-4 w-4" />
                  <span className="text-sm font-medium">Home</span>
                </div>
              </Link>

              <Link href="/documentation">
                <div
                  className={`flex items-center gap-2 rounded-full border border-transparent bg-white/5 px-4 py-2 text-white/80 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white ${
                    pathname === '/documentation' ? 'border-white/20 bg-white/20 text-white' : ''
                  }`}
                >
                  <BookOpen className="h-4 w-4" />
                  <span className="text-sm font-medium">Documentation</span>
                </div>
              </Link>

              <Link href="/help">
                <div
                  className={`flex items-center gap-2 rounded-full border border-transparent bg-white/5 px-4 py-2 text-white/80 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white ${
                    pathname === '/help' ? 'border-white/20 bg-white/20 text-white' : ''
                  }`}
                >
                  <HelpCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">Help</span>
                </div>
              </Link>

              {session && (
                <Link href="/settings">
                  <div
                    className={`flex items-center gap-2 rounded-full border border-transparent bg-white/5 px-4 py-2 text-white/80 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white ${
                      pathname.startsWith('/settings') ? 'border-white/20 bg-white/20 text-white' : ''
                    }`}
                  >
                    <Settings className="h-4 w-4" />
                    <span className="text-sm font-medium">Settings</span>
                  </div>
                </Link>
              )}
            </div>

            {session ? (
              <button
                className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-white/90 hover:bg-white/20"
                onClick={onLogout}
              >
                Logout
              </button>
            ) : (
              <Link
                href="/login"
                className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-white/90 hover:bg-white/20"
              >
                Login/Signup
              </Link>
            )}
          </div>

          <div className="md:hidden">
            {session ? (
              <button
                className="rounded border border-white/20 bg-white/10 px-3 py-1 text-sm text-white/90"
                onClick={onLogout}
              >
                Logout
              </button>
            ) : (
              <Link
                href="/login"
                className="rounded border border-white/20 bg-white/10 px-3 py-1 text-sm text-white/90"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

