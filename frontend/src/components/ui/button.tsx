import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--canon-purple)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-page)] disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        default: "bg-[var(--canon-purple)] text-[var(--text-on-accent)] border-0 rounded-[7px] px-[11px] py-[6px] type-control flex items-center gap-[5px] cursor-pointer shadow-[var(--brand-shadow)] hover:bg-[var(--canon-purple-hover)] transition-colors duration-[120ms]",
        secondary: "bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-secondary)] rounded-[7px] px-[11px] py-[6px] type-control flex items-center gap-[5px] cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors duration-[120ms]",
        outline: "bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-secondary)] rounded-[7px] px-[11px] py-[6px] type-control flex items-center gap-[5px] cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors duration-[120ms]",
        ghost: "bg-transparent text-[var(--text-secondary)] rounded-[7px] px-[11px] py-[6px] type-control flex items-center gap-[5px] cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors duration-[120ms]",
        destructive: "bg-[var(--red)] text-[var(--text-on-accent)] border border-[var(--red)] rounded-[7px] px-[11px] py-[6px] type-control cursor-pointer hover:bg-[var(--red-hover)] hover:border-[var(--red-hover)] transition-colors duration-[120ms]",
      },
      size: {
        default: "",
        sm: "px-[10px] py-[5px] type-control-sm",
        lg: "px-[13px] py-[7px] type-control",
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
    const buttonProps = asChild ? props : { ...props, type: props.type ?? "button" };
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, radius }), className)}
        ref={ref}
        {...buttonProps}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
