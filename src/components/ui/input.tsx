import * as React from "react";
import { cn } from "./utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "input-ui flex h-9 w-full rounded-[7px] border border-[var(--border-secondary)] bg-[var(--bg-secondary)] px-[10px] py-[6px] type-field text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-colors duration-[120ms] focus-visible:outline-none focus-visible:border-[var(--canon-purple)] focus-visible:ring-2 focus-visible:ring-[var(--canon-purple)]/25 disabled:cursor-not-allowed disabled:opacity-60",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
