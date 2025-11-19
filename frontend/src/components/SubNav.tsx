'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Generate sub-tabs (shown when on /documentation or /architecture)
const generateTabs = [
  { name: 'Documentation', href: '/documentation' },
  { name: 'Architecture', href: '/architecture' },
];

// Default tabs (shown on other routes)
const defaultTabs = [
  { name: 'Overview', href: '/overview' },
  { name: 'Logs', href: '/logs' },
  { name: 'Edit', href: '/edit' },
];

function isActive(currentPath: string, href: string) {
  if (href === '/edit' && currentPath.startsWith('/edit')) return true;
  if (href === '/architecture' && currentPath.startsWith('/architecture')) return true;
  if (href === '/documentation' && currentPath.startsWith('/documentation')) return true;
  if (href === '/overview' && currentPath === '/overview') return true;
  if (href === '/logs' && currentPath === '/logs') return true;
  return currentPath === href;
}

export function SubNav() {
  const pathname = usePathname();
  
  // Show generate sub-tabs when on /documentation or /architecture routes
  const isGenerateRoute = pathname.startsWith('/documentation') || pathname.startsWith('/architecture');
  const tabs = isGenerateRoute ? generateTabs : defaultTabs;

  return (
    <nav className="relative z-10 border-b border-white/10 bg-black/10 backdrop-blur-xl">
      <div className="page-shell flex h-12 items-center gap-2 overflow-x-auto">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="nav-pill text-sm"
            data-active={isActive(pathname, tab.href)}
            aria-current={isActive(pathname, tab.href) ? 'page' : undefined}
          >
            {tab.name}
          </Link>
        ))}
      </div>
    </nav>
  );
}

