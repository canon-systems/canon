'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { cn } from '@/components/ui/utils';

export type { DateRange } from 'react-day-picker';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('rdp-root p-3 text-white', className)}
      classNames={{
        root: 'rdp-root',
        months: 'flex flex-col sm:flex-row gap-2',
        month: 'flex flex-col gap-4',
        month_caption: 'flex justify-center pt-1 relative items-center',
        caption_label: 'text-sm font-medium text-white',
        nav: 'flex items-center gap-1',
        button_previous: 'absolute left-1 h-9 w-9 bg-transparent p-0 opacity-70 hover:opacity-100 inline-flex items-center justify-center rounded-md border border-white/20 text-white hover:bg-white/10',
        button_next: 'absolute right-1 h-9 w-9 bg-transparent p-0 opacity-70 hover:opacity-100 inline-flex items-center justify-center rounded-md border border-white/20 text-white hover:bg-white/10',
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'text-white/60 rounded-md w-9 font-normal text-[0.8rem]',
        week: 'flex w-full mt-1',
        day: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-white/10 [&:has([aria-selected].day-outside)]:bg-white/5 [&:has([aria-selected].day-range-end)]:rounded-r-md',
        day_button:
          'h-9 w-9 p-0 font-normal aria-selected:opacity-100 rounded-md border border-transparent hover:bg-white/10 hover:border-white/20 text-white inline-flex items-center justify-center',
        range_start: 'day-range-start rounded-l-md bg-white/20 text-white',
        range_middle: 'day-range-middle bg-white/10 rounded-none',
        range_end: 'day-range-end rounded-r-md bg-white/20 text-white',
        selected:
          'bg-white text-black hover:bg-white hover:text-black focus:bg-white focus:text-black',
        today: 'bg-white/20 text-white',
        outside:
          'day-outside text-white/40 opacity-50 aria-selected:bg-white/5 aria-selected:text-white/40',
        disabled: 'text-white/30 opacity-50',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left' ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
