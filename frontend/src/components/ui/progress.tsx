import * as React from "react";
import { cn } from "./utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  indicatorClassName?: string;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, indicatorClassName, value = 0, ...props }, ref) => {
    const pct = Math.min(100, Math.max(0, value));
    return (
      <div
        ref={ref}
        className={cn(
          "relative h-2 w-full overflow-hidden rounded-full bg-white/10",
          className
        )}
        {...props}
      >
        <div
          className={cn(
            "h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-[transform] duration-300 ease-out",
            indicatorClassName
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    );
  }
);
Progress.displayName = "Progress";

interface ProgressWithLabelProps {
  label: string;
  value: number;
  className?: string;
}

function ProgressWithLabel({ label, value, className }: ProgressWithLabelProps) {
  const pct = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div className={cn("w-full space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-white truncate">{label}</span>
        <span className="text-sm font-medium text-white tabular-nums shrink-0">{pct}%</span>
      </div>
      <Progress value={pct} className="h-1.5 bg-white/15" />
    </div>
  );
}

export { Progress, ProgressWithLabel };
