'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { name: 'Submit', href: '/submit' },
  { name: 'Edit', href: '/edit' },
  { name: 'Architecture', href: '/architecture' },
];

function isActive(currentPath: string, href: string) {
  if (href === '/edit' && currentPath.startsWith('/edit')) return true;
  if (href === '/architecture' && currentPath.startsWith('/architecture')) return true;
  return currentPath === href;
}

export function SubNav() {
  const pathname = usePathname();

  return (
    <nav className="z-10 border-b border-white/10 bg-black/20">
      <div className="mx-auto flex h-12 max-w-7xl items-center gap-2 px-4 sm:px-6 lg:px-8">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-full px-3 py-1.5 text-sm transition hover:bg-white/15 ${
              isActive(pathname, tab.href) ? 'bg-white/15' : 'bg-white/5'
            }`}
            aria-current={isActive(pathname, tab.href) ? 'page' : undefined}
          >
            {tab.name}
          </Link>
        ))}
      </div>
    </nav>
  );
}

