import * as React from 'react';

import { cn } from '@/lib/utils';

export interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
}

const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} role="radiogroup" className={cn('grid gap-3', className)} {...props} />
  )
);
RadioGroup.displayName = 'RadioGroup';

export interface RadioGroupItemProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string;
  title: string;
  description?: string;
}

const RadioGroupItem = React.forwardRef<HTMLInputElement, RadioGroupItemProps>(
  ({ className, title, description, ...props }, ref) => (
    <label
      className={cn(
        'flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 transition hover:bg-white/[0.06]',
        className
      )}
    >
      <input
        ref={ref}
        type="radio"
        className="mt-0.5 h-4 w-4 rounded-full border-white/30 bg-white/5 text-white focus:ring-2 focus:ring-white/40 focus:ring-offset-2 focus:ring-offset-black"
        {...props}
      />
      <div className="flex-1">
        <p className="text-sm font-medium text-white">{title}</p>
        {description ? <p className="mt-1 text-sm text-white/60">{description}</p> : null}
      </div>
    </label>
  )
);
RadioGroupItem.displayName = 'RadioGroupItem';

export { RadioGroup, RadioGroupItem };
