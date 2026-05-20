import { cn } from './utils';

type BadgeVariant =
  | 'active'
  | 'paused'
  | 'completed'
  | 'error'
  | 'pending'
  | 'stalled'
  | 'delivered'
  | 'upcoming'
  | 'global'
  | 'custom';

const variants: Record<BadgeVariant, string> = {
  active: 'bg-[var(--green-bg)] text-[var(--green-text)]',
  paused: 'bg-[var(--amber-bg)] text-[var(--amber-text)]',
  completed: 'bg-[var(--canon-purple-light)] text-[var(--canon-purple-dark)]',
  error: 'bg-[var(--red-bg)] text-[var(--red-text)]',
  pending: 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)]',
  stalled: 'bg-[var(--amber-bg)] text-[var(--amber-text)]',
  delivered: 'bg-[var(--green-bg)] text-[var(--green-text)]',
  upcoming: 'bg-[var(--canon-purple-light)] text-[var(--canon-purple-dark)]',
  global: 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)] border border-[var(--border-tertiary)]',
  custom: 'bg-[var(--canon-purple-light)] text-[var(--canon-purple-dark)] border border-[var(--canon-purple-border)]',
};

const labels: Record<BadgeVariant, string> = {
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  error: 'Error',
  pending: 'Pending',
  stalled: 'Stalled',
  delivered: 'Delivered',
  upcoming: 'Upcoming',
  global: 'Global Default',
  custom: 'Custom',
};

function toTitleCase(value: string) {
  return value
    .replace(/[_-]/g, ' ')
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

export function StatusBadge({ variant, label }: { variant: BadgeVariant; label?: string }) {
  return (
    <span
      className={cn(
        'text-[10px] font-medium px-[7px] py-[2px] rounded-[4px] whitespace-nowrap',
        variants[variant]
      )}
    >
      {label ? toTitleCase(label) : labels[variant]}
    </span>
  );
}

export type { BadgeVariant };
