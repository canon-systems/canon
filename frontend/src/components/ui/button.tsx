import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--canon-purple)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-page)] disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        default: "bg-[var(--canon-purple)] text-[var(--text-primary)] border-0 rounded-[7px] px-[13px] py-[7px] text-[13px] flex items-center gap-[5px] cursor-pointer hover:opacity-90 transition-opacity duration-[120ms]",
        secondary: "bg-transparent text-[var(--text-secondary)] border border-[var(--border-secondary)] rounded-[7px] px-[13px] py-[7px] text-[12px] flex items-center gap-[5px] cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors duration-[120ms]",
        outline: "bg-transparent text-[var(--text-secondary)] border border-[var(--border-secondary)] rounded-[7px] px-[13px] py-[7px] text-[12px] flex items-center gap-[5px] cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors duration-[120ms]",
        ghost: "bg-transparent text-[var(--text-secondary)] rounded-[7px] px-[13px] py-[7px] text-[12px] flex items-center gap-[5px] cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors duration-[120ms]",
        destructive: "bg-transparent text-[var(--red-text)] border border-[var(--red-border)] rounded-[7px] px-[13px] py-[6px] text-[12px] cursor-pointer hover:bg-[var(--red-bg)] transition-colors duration-[120ms]",
      },
      size: {
        default: "",
        sm: "px-[11px] py-[6px] text-[12px]",
        lg: "px-4 py-[9px] text-[14px]",
        icon: "w-7 h-7 rounded-md border border-[var(--border-tertiary)] bg-transparent flex items-center justify-center cursor-pointer text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] transition-colors duration-[120ms] p-0",
      },
      radius: {
        md: "rounded-[7px]",
        full: "rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      radius: "full",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, radius, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, radius }), className)}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
