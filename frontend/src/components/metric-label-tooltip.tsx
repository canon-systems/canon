'use client';

import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function MetricLabelTooltip({
  label,
  tip,
}: {
  label: string;
  tip: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span>{label}</span>
      <TooltipProvider delayDuration={120}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex h-4 w-4 items-center justify-center text-white/45 hover:text-white/70"
              aria-label={tip}
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs leading-relaxed">
            {tip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </span>
  );
}
