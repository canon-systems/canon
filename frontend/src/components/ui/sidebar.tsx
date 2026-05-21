'use client';

import * as React from 'react';
import { PanelLeft, PanelRight } from 'lucide-react';
import { cn } from './utils';
import { Button } from './button';

type SidebarContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used inside a <SidebarProvider>');
  }
  return context;
}

interface SidebarProviderProps {
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function SidebarProvider({ children, defaultOpen = true, className }: SidebarProviderProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const toggle = React.useCallback(() => setOpen((prev) => !prev), []);

  return (
    <SidebarContext.Provider value={{ open, setOpen, toggle }}>
      <div className={cn('w-full', className)}>{children}</div>
    </SidebarContext.Provider>
  );
}

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: 'left' | 'right';
  variant?: 'floating';
}

export const Sidebar = React.forwardRef<HTMLDivElement, SidebarProps>(function Sidebar(
  { className, children, side = 'left', variant = 'floating', ...props },
  ref
) {
  const { open } = useSidebar();

  return (
    <aside
      ref={ref}
      data-open={open}
      data-side={side}
      data-variant={variant}
      className={cn(
        'relative transition-all duration-300 ease-in-out',
        open ? 'max-w-xl sm:max-w-xs lg:max-w-[320px] w-full sm:w-80 opacity-100' : 'max-w-0 w-0 opacity-0',
        'overflow-visible lg:overflow-hidden',
        side === 'right' ? 'lg:order-last' : '',
        className
      )}
      aria-hidden={!open}
      {...props}
    >
      <div
        className={cn(
          'group/sidebar relative',
          'rounded-2xl border border-[var(--border-tertiary)] bg-[var(--bg-secondary)] p-4  backdrop-blur-2xl',
          'transition-all duration-300 ease-in-out',
          open ? 'translate-y-0 opacity-100 pointer-events-auto' : '-translate-y-2 opacity-0 pointer-events-none',
          'lg:sticky lg:top-24'
        )}
      >
        {children}
      </div>
    </aside>
  );
});

type SidebarInsetProps = React.HTMLAttributes<HTMLDivElement>;

export const SidebarInset = React.forwardRef<HTMLDivElement, SidebarInsetProps>(function SidebarInset(
  { className, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn('flex-1 min-w-0', className)}
      {...props}
    />
  );
});

type SidebarSectionProps = React.HTMLAttributes<HTMLDivElement>;

export const SidebarHeader = React.forwardRef<HTMLDivElement, SidebarSectionProps>(function SidebarHeader(
  { className, ...props },
  ref
) {
  return <div ref={ref} className={cn('mb-4 flex items-center justify-between gap-3', className)} {...props} />;
});

export const SidebarContent = React.forwardRef<HTMLDivElement, SidebarSectionProps>(function SidebarContent(
  { className, ...props },
  ref
) {
  return <div ref={ref} className={cn('space-y-5', className)} {...props} />;
});

export const SidebarFooter = React.forwardRef<HTMLDivElement, SidebarSectionProps>(function SidebarFooter(
  { className, ...props },
  ref
) {
  return <div ref={ref} className={cn('mt-6 border-t border-[var(--border-tertiary)] pt-4', className)} {...props} />;
});

export const SidebarGroup = React.forwardRef<HTMLDivElement, SidebarSectionProps>(function SidebarGroup(
  { className, ...props },
  ref
) {
  return <div ref={ref} className={cn('space-y-2 rounded-xl border border-[var(--border-tertiary)] bg-[var(--bg-secondary)] p-3', className)} {...props} />;
});

export const SidebarGroupLabel = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  function SidebarGroupLabel({ className, ...props }, ref) {
    return (
      <p
        ref={ref}
        className={cn('type-caption text-[var(--text-secondary)] block mb-1', className)}
        {...props}
      />
    );
  }
);

export const SidebarGroupContent = React.forwardRef<HTMLDivElement, SidebarSectionProps>(function SidebarGroupContent(
  { className, ...props },
  ref
) {
  return <div ref={ref} className={cn('space-y-2', className)} {...props} />;
});

export const SidebarMenu = React.forwardRef<HTMLUListElement, React.HTMLAttributes<HTMLUListElement>>(function SidebarMenu(
  { className, ...props },
  ref
) {
  return <ul ref={ref} className={cn('grid gap-2', className)} {...props} />;
});

export const SidebarMenuItem = React.forwardRef<HTMLLIElement, React.HTMLAttributes<HTMLLIElement>>(function SidebarMenuItem(
  { className, ...props },
  ref
) {
  return <li ref={ref} className={cn('list-none', className)} {...props} />;
});

export const SidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }
>(function SidebarMenuButton({ className, active, ...props }, ref) {
  return (
    <button
      ref={ref}
      type={props.type ?? 'button'}
      data-active={active}
      className={cn(
        'w-full rounded-lg border border-transparent px-3 py-2 text-left type-body transition',
        active
          ? 'border-[var(--border-tertiary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] '
          : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:border-[var(--border-tertiary)] hover:bg-[var(--bg-secondary)]',
        className
      )}
      {...props}
    />
  );
});

interface SidebarTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  direction?: 'left' | 'right';
}

export const SidebarTrigger = React.forwardRef<HTMLButtonElement, SidebarTriggerProps>(function SidebarTrigger(
  { className, direction = 'left', onClick, ...props },
  ref
) {
  const { open, toggle } = useSidebar();
  const Icon = direction === 'left' ? (open ? PanelLeft : PanelRight) : open ? PanelRight : PanelLeft;

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      aria-pressed={open}
      aria-label={open ? 'Collapse Sidebar' : 'Expand Sidebar'}
      onClick={(event) => {
        toggle();
        onClick?.(event);
      }}
      className={cn(
        'h-8 w-8 rounded-full border border-[var(--border-tertiary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]',
        className
      )}
      {...props}
    >
      <Icon className="h-5 w-5" />
    </Button>
  );
});
