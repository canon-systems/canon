import * as React from 'react';

import { cn } from '@/lib/utils';

type ButtonVariant = 'default' | 'secondary' | 'outline' | 'ghost';
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & CommonProps;

const baseClasses =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[8px] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--canon-purple)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-page)] disabled:pointer-events-none disabled:opacity-60';

const variantClasses: Record<ButtonVariant, string> = {
  default:
    'bg-[var(--canon-purple)] text-white hover:opacity-90',
  secondary:
    'bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border-tertiary)] hover:bg-[var(--bg-secondary)] hover:border-[var(--border-secondary)]',
  outline:
    'border border-[var(--border-tertiary)] text-[var(--text-primary)] hover:bg-[var(--bg-primary)]',
  ghost:
    'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]',
};

const sizeClasses: Record<ButtonSize, string> = {
  default: 'h-9 px-4 py-2',
  sm: 'h-8 px-3 text-xs',
  lg: 'h-11 px-6 text-base',
  icon: 'h-9 w-9',
};

function buttonClassName({
  variant = 'default',
  size = 'default',
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  return cn(baseClasses, variantClasses[variant], sizeClasses[size], className);
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, type, children, ...props }, ref) => {
    const classes = buttonClassName({ variant, size, className });

    if (asChild) {
      if (!React.isValidElement(children)) return null;

      const child = children as React.ReactElement<{ className?: string }>;
      return React.cloneElement(child, {
        className: cn(classes, child.props.className),
      });
    }

    return (
      <button
        ref={ref}
        className={classes}
        type={type ?? 'button'}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonClassName };
