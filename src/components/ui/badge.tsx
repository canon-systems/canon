import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-[3px] type-caption font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-tertiary)]",
        secondary: "bg-[var(--canon-purple-light)] text-[var(--canon-purple-dark)] border border-[var(--canon-purple-border)]",
        outline: "bg-transparent text-[var(--text-primary)] border border-[var(--border-secondary)]",
        muted: "bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-tertiary)]",
        success: "border-[var(--green-border)] bg-[var(--green-bg)] text-[var(--green-text)]",
        warning: "border-[var(--amber-border)] bg-[var(--amber-bg)] text-[var(--amber-text)]",
        destructive: "border-[var(--red-border)] bg-[var(--red-bg)] text-[var(--red-text)]",
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
