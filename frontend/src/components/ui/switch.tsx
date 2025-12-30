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
        className="relative inline-flex h-6 w-11 items-center rounded-full border border-white/10 bg-white/10 transition peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-white/40 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-black peer-checked:bg-white/20"
      >
        <span className="inline-block h-5 w-5 translate-x-0.5 rounded-full bg-white/80 shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  )
);
Switch.displayName = "Switch";

export { Switch };
