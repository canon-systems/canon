import * as React from "react";
import { cn } from "./utils";

interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  onValueChange?: (value: string) => void;
}

const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ className, value, onValueChange, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("grid gap-3", className)}
        role="radiogroup"
        {...props}
      >
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child)) {
            return React.cloneElement(child as React.ReactElement<any>, {
              checked: child.props.value === value,
              onCheckedChange: () => onValueChange?.(child.props.value),
            });
          }
          return child;
        })}
      </div>
    );
  }
);
RadioGroup.displayName = "RadioGroup";

interface RadioGroupItemProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string;
  checked?: boolean;
  onCheckedChange?: () => void;
}

const RadioGroupItem = React.forwardRef<HTMLInputElement, RadioGroupItemProps>(
  ({ className, value, checked, onCheckedChange, children, ...props }, ref) => {
    return (
      <label
        className={cn(
          "flex items-start gap-3 rounded-lg border p-4 transition-colors cursor-pointer",
          checked
            ? "border-amber-500/50 bg-amber-500/10"
            : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10",
          className
        )}
      >
        <input
          ref={ref}
          type="radio"
          value={value}
          checked={checked}
          onChange={onCheckedChange}
          className="mt-0.5 h-4 w-4 rounded-full border-white/30 bg-white/5 text-amber-500 focus:ring-2 focus:ring-amber-500/50 focus:ring-offset-2 focus:ring-offset-black"
          {...props}
        />
        <div className="flex-1">{children}</div>
      </label>
    );
  }
);
RadioGroupItem.displayName = "RadioGroupItem";

export { RadioGroup, RadioGroupItem };

