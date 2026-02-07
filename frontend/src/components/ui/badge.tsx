import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-white/10 text-white border border-white/10",
        secondary: "bg-white text-black border border-black/10",
        outline: "bg-white text-black border border-black/20",
        muted: "bg-gray-800 text-white border border-gray-700",
        success: "border-white/20 bg-white/10 text-white/80",
        warning: "border-white/20 bg-white/5 text-white/70",
        destructive: "border-white/25 bg-white/8 text-white/80",
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
