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
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:pointer-events-none disabled:opacity-60';

const variantClasses: Record<ButtonVariant, string> = {
  default:
    'bg-white text-black hover:bg-white/90 shadow-[0_10px_30px_rgba(255,255,255,0.12)]',
  secondary:
    'bg-white/10 text-white hover:bg-white/15 border border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.45)]',
  outline: 'border border-white/20 text-white hover:bg-white/10',
  ghost: 'text-white hover:bg-white/10',
};

const sizeClasses: Record<ButtonSize, string> = {
  default: 'h-10 px-4 py-2',
  sm: 'h-9 px-3',
  lg: 'h-11 px-5 text-base',
  icon: 'h-10 w-10',
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
