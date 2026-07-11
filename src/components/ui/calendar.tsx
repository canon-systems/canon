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
      navLayout="around"
      className={cn('rdp-root p-3 text-[var(--text-primary)]', className)}
      classNames={{
        root: 'rdp-root',
        months: 'flex flex-col sm:flex-row gap-2',
        month: 'flex flex-col gap-2 relative',
        month_caption: 'flex justify-center items-center min-h-9 pt-1 pb-2 mx-9 relative',
        caption_label: 'type-control text-[var(--text-primary)]',
        nav: 'flex items-center gap-1',
        button_previous: 'absolute left-0 top-0 h-9 w-9 bg-transparent p-0 opacity-70 hover:opacity-100 inline-flex items-center justify-center rounded border border-[var(--border-tertiary)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]',
        button_next: 'absolute right-0 top-0 h-9 w-9 bg-transparent p-0 opacity-70 hover:opacity-100 inline-flex items-center justify-center rounded border border-[var(--border-tertiary)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]',
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'text-[var(--text-secondary)] rounded-md w-9 font-normal text-[0.8rem]',
        week: 'flex w-full mt-1',
        day: 'relative p-0 text-center type-body focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-[var(--bg-secondary)] [&:has([aria-selected].day-outside)]:bg-[var(--bg-secondary)] [&:has([aria-selected].day-range-end)]:rounded-r-md',
        day_button:
          'h-9 w-9 p-0 font-normal aria-selected:opacity-100 rounded-md border border-transparent hover:bg-[var(--bg-secondary)] hover:border-[var(--border-tertiary)] text-[var(--text-primary)] inline-flex items-center justify-center',
        range_start: 'day-range-start rounded-l-md bg-[var(--bg-secondary)] text-[var(--text-primary)]',
        range_middle: 'day-range-middle bg-[var(--bg-secondary)] rounded-none',
        range_end: 'day-range-end rounded-r-md bg-[var(--bg-secondary)] text-[var(--text-primary)]',
        selected:
          'bg-[var(--text-primary)] text-[var(--bg-page)] hover:bg-[var(--text-primary)] hover:text-[var(--bg-page)] focus:bg-[var(--text-primary)] focus:text-[var(--bg-page)]',
        today: 'bg-[var(--bg-secondary)] text-[var(--text-primary)]',
        outside:
          'day-outside text-[var(--text-secondary)] opacity-50 aria-selected:bg-[var(--bg-secondary)] aria-selected:text-[var(--text-secondary)]',
        disabled: 'text-[var(--text-secondary)] opacity-50',
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
