'use client';

import * as React from 'react';
import * as RechartsPrimitive from 'recharts';
import { cn } from '@/components/ui/utils';

export type ChartConfig = {
  [key: string]: {
    label?: React.ReactNode;
    color?: string;
  };
};

type ChartContextValue = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextValue | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) {
    throw new Error('useChart must be used within a <ChartContainer />');
  }
  return context;
}

function chartStyleFromConfig(config: ChartConfig): React.CSSProperties {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(config)) {
    if (value.color) {
      vars[`--color-${key}`] = value.color;
    }
  }
  return vars as React.CSSProperties;
}

export const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    config: ChartConfig;
    children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>['children'];
  }
>(({ config, className, children, style, ...props }, ref) => {
  const mergedStyle = { ...chartStyleFromConfig(config), ...style };

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        ref={ref}
        className={cn('h-[260px] w-full text-xs', className)}
        style={mergedStyle}
        {...props}
      >
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
});
ChartContainer.displayName = 'ChartContainer';

export const ChartTooltip = RechartsPrimitive.Tooltip;

type TooltipPayloadItem = {
  dataKey?: string | number;
  name?: string;
  value?: number | string;
  color?: string;
};

export function ChartTooltipContent({
  active,
  payload,
  label,
  className,
  hideLabel = false,
  labelFormatter,
  valueFormatter,
}: React.ComponentProps<'div'> & {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  hideLabel?: boolean;
  labelFormatter?: (label: string | number | undefined) => React.ReactNode;
  valueFormatter?: (value: number | string, item: TooltipPayloadItem) => React.ReactNode;
}) {
  const { config } = useChart();

  if (!active || !payload || payload.length === 0) return null;

  return (
    <div
      className={cn(
        'rounded-md border border-white/20 bg-zinc-950/95 px-3 py-2 text-xs text-white shadow-xl',
        className
      )}
    >
      {!hideLabel ? <p className="mb-2 text-white/70">{labelFormatter ? labelFormatter(label) : label}</p> : null}
      <div className="space-y-1.5">
        {payload.map((item, idx) => {
          const key = String(item.dataKey ?? item.name ?? idx);
          const cfg = config[key];
          const dotColor = item.color || cfg?.color || '#e5e7eb';
          return (
            <div key={`${key}-${idx}`} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} />
                <span className="text-white/80">{cfg?.label ?? item.name ?? key}</span>
              </div>
              <span className="font-medium text-white">
                {valueFormatter ? valueFormatter(item.value ?? 0, item) : item.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
