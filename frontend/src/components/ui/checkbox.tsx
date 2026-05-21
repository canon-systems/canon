import * as React from "react";
import { cn } from "./utils";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, ...props }, ref) => (
    <label className="inline-flex items-center cursor-pointer">
      <input
        ref={ref}
        type="checkbox"
        className={cn(
          "peer h-4 w-4 rounded border border-[var(--border-tertiary)] bg-[var(--bg-secondary)] text-[var(--canon-purple)] focus:ring-2 focus:ring-[var(--canon-purple)]/30",
          className
        )}
        checked={checked}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
        {...props}
      />
      <span className="sr-only">Toggle</span>
    </label>
  )
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
