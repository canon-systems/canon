import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-tertiary)]",
        secondary: "bg-[var(--text-primary)] text-[var(--bg-page)] border border-black/10",
        outline: "bg-[var(--text-primary)] text-[var(--bg-page)] border border-black/20",
        muted: "bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-tertiary)]",
        success: "border-[var(--border-tertiary)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]",
        warning: "border-[var(--border-tertiary)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]",
        destructive: "border-[var(--border-tertiary)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
  VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {children}
    </div>
  );
}

export { Badge };
