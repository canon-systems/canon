import * as React from 'react';

import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white shadow-inner shadow-black/20 transition placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-60',
      className
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export { Input };
