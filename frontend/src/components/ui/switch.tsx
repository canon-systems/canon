import * as React from "react";
import { cn } from "./utils";

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, onCheckedChange, ...props }, ref) => (
    <label className={cn("inline-flex items-center cursor-pointer", className)}>
      <input
        ref={ref}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
        {...props}
      />
      <span
        aria-hidden="true"
        className="relative inline-flex h-6 w-11 items-center justify-start rounded-full border border-[var(--border-tertiary)] bg-[var(--bg-secondary)] transition-colors duration-[120ms] peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--canon-purple)]/30 peer-checked:justify-end peer-checked:border-[var(--canon-purple-border)] peer-checked:bg-[var(--canon-purple-light)]"
      >
        <span className="inline-block h-5 w-5 rounded-full bg-[var(--text-primary)] transition-colors duration-[120ms]" />
      </span>
    </label>
  )
);
Switch.displayName = "Switch";

export { Switch };
