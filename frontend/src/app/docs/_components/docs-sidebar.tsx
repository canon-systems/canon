'use client';

import {
  BookOpen,
  Settings,
  History,
  Activity,
  MessageCircle,
  ChevronDown,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

import { cn } from '@/components/ui/utils';

type NavLink = { href: string; label: string };
type NavNode = NavLink & { children?: NavNode[] };

const nav = {
  overview: { href: '/docs/overview', label: 'Overview', icon: BookOpen },
  setup: {
    label: 'Setup',
    icon: Settings,
    items: [
      {
        href: '/docs/connect-integrations',
        label: 'Connect Integrations',
        children: [
          { href: '/docs/connect-integrations/github', label: 'GitHub' },
          {
            href: '/docs/connect-integrations/atlassian',
            label: 'Atlassian',
            children: [{ href: '/docs/jira-webhook-setup', label: 'Jira Webhook Setup' }],
          },
          {
            href: '/docs/connect-integrations/slack',
            label: 'Slack',
            children: [{ href: '/docs/connect-integrations/slack/add-bot-to-channel', label: 'Add bot to channel' }],
          },
        ],
      },
      { href: '/docs/preferences', label: 'Preferences' },
    ],
  },
  using: {
    label: 'Using Canon',
    icon: Activity,
    items: [
      { href: '/docs/history', label: 'History', icon: History },
      { href: '/docs/signals', label: 'Signals', icon: Activity },
      { href: '/docs/sources', label: 'Sources', icon: Activity },
    ],
  },
  help: { href: '/docs/help', label: 'Need Help?', icon: MessageCircle },
};

function isChildActive(pathname: string, href: string): boolean {
  if (href === '/docs') return pathname === '/docs';
  return pathname === href || pathname.startsWith(href + '/');
}

export function DocsSidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => isChildActive(pathname, href);

  const renderNode = (node: NavNode, depth: number) => {
    const hasChildren = node.children && node.children.length > 0;
    const openByDefault = hasChildren && node.children!.some((c) => isActive(c.href) || (c.children && c.children.some((d) => isActive(d.href))));

    const linkClass = cn(
      'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition hover:bg-white/10 hover:text-white',
      isActive(node.href) ? 'bg-white/10 text-white' : 'text-white/85'
    );
    if (!hasChildren) {
      return (
        <li key={node.href}>
          <Link href={node.href} className={linkClass}>
            {node.label}
          </Link>
        </li>
      );
    }

    return (
      <li key={node.href} className="space-y-0.5">
        <Collapsible defaultOpen={openByDefault} className="group/navitem">
          <div
            className={cn(
              'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition hover:bg-white/10 hover:text-white',
              'text-white/85 group-data-[state=open]/navitem:text-white',
              isActive(node.href) && 'bg-white/10 text-white'
            )}
          >
            <Link
              href={node.href}
              className={cn(
                'min-w-0 flex-1 text-left text-sm',
                'text-white/85 group-data-[state=open]/navitem:text-white',
                isActive(node.href) && 'text-white'
              )}
            >
              {node.label}
            </Link>
            <CollapsibleTrigger
              aria-label="Expand or collapse section"
              className="shrink-0 rounded p-0.5 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              <ChevronDown className="h-4 w-4 text-white/50 transition-transform group-data-[state=open]/navitem:rotate-180" />
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <ul className={cn('ml-3 mt-0.5 space-y-0.5 border-l border-white/10 pl-3', depth > 0 && 'ml-3')}>
              {node.children!.map((child) => renderNode(child, depth + 1))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      </li>
    );
  };

  return (
    <aside className="w-64 shrink-0 lg:w-72">
      <nav
        className="sticky top-24 rounded-2xl border border-white/10 bg-zinc-800/80 p-4"
        aria-label="Documentation"
      >
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/50">
          Documentation
        </h2>
        <ul className="space-y-1">
          <li>
            <Link
              href="/docs"
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition hover:bg-white/10 hover:text-white',
                pathname === '/docs' ? 'bg-white/10 text-white' : 'text-white/85'
              )}
            >
              <BookOpen className="h-4 w-4 text-white/50" />
              Home
            </Link>
          </li>
          <li>
            <Link
              href={nav.overview.href}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition hover:bg-white/10 hover:text-white',
                isActive(nav.overview.href) ? 'bg-white/10 text-white' : 'text-white/85'
              )}
            >
              <nav.overview.icon className="h-4 w-4 text-white/50" />
              {nav.overview.label}
            </Link>
          </li>

          <li>
            <Collapsible defaultOpen className="group/collapse">
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-white/85 transition hover:bg-white/10 hover:text-white">
                <span className="flex items-center gap-2 text-sm text-white/85">
                  <nav.setup.icon className="h-4 w-4 text-white/50" />
                  {nav.setup.label}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-white/50 transition-transform group-data-[state=open]/collapse:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="ml-2 mt-1 space-y-0.5 border-l border-white/10 pl-3">
                  {nav.setup.items.map((item) => {
                    const hasChildren = 'children' in item && item.children && item.children.length > 0;
                    if (!hasChildren) {
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className={cn(
                              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition hover:bg-white/10 hover:text-white',
                              isActive(item.href) ? 'bg-white/10 text-white' : 'text-white/85'
                            )}
                          >
                            {item.label}
                          </Link>
                        </li>
                      );
                    }
                    return renderNode(item as NavNode, 0);
                  })}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          </li>

          <li>
            <Collapsible defaultOpen className="group/collapse">
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-white/85 transition hover:bg-white/10 hover:text-white">
                <span className="flex items-center gap-2 text-sm text-white/85">
                  <nav.using.icon className="h-4 w-4 text-white/50" />
                  {nav.using.label}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-white/50 transition-transform group-data-[state=open]/collapse:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="ml-2 mt-1 space-y-0.5 border-l border-white/10 pl-3">
                  {nav.using.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition hover:bg-white/10 hover:text-white',
                          isActive(item.href) ? 'bg-white/10 text-white' : 'text-white/85'
                        )}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          </li>

          <li>
            <Link
              href={nav.help.href}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition hover:bg-white/10 hover:text-white',
                isActive(nav.help.href) ? 'bg-white/10 text-white' : 'text-white/85'
              )}
            >
              <nav.help.icon className="h-4 w-4 text-white/50" />
              {nav.help.label}
            </Link>
          </li>
        </ul>
      </nav>
    </aside>
  );
}
