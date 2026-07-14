import * as React from "react";
import { cn } from "./utils";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "textarea-ui flex min-h-[84px] w-full resize-none rounded-[7px] border border-[var(--border-secondary)] bg-[var(--bg-secondary)] px-[10px] py-[7px] type-field text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-colors duration-[120ms] focus-visible:outline-none focus-visible:border-[var(--canon-purple)] focus-visible:ring-2 focus-visible:ring-[var(--canon-purple)]/25 disabled:cursor-not-allowed disabled:opacity-60",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Textarea };
