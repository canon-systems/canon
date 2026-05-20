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
          "relative h-2 w-full overflow-hidden rounded-full bg-[var(--bg-secondary)]",
          className
        )}
        {...props}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300 ease-out",
            indicatorClassName
          )}
          style={{ width: `${pct}%`, background: "var(--canon-purple-gradient)" }}
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
        <span className="text-sm font-medium text-[var(--text-primary)] truncate">{label}</span>
        <span className="text-sm font-medium text-[var(--text-primary)] tabular-nums shrink-0">{pct}%</span>
      </div>
      <Progress value={pct} className="h-1.5 bg-[var(--bg-secondary)]" />
    </div>
  );
}

export { Progress, ProgressWithLabel };
