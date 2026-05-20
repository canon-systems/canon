import { cn } from './utils';

type MilestoneStatus = 'done' | 'current' | 'pending';

interface Milestone {
  label: string;
  status: MilestoneStatus;
}

export function MilestoneProgress({ milestones, progress }: { milestones: Milestone[]; progress: number }) {
  return (
    <div>
      <div
        className="relative h-1 rounded-sm my-[6px] mb-[18px]"
        style={{ backgroundColor: 'var(--border-tertiary)' }}
      >
        <div
          className="h-full rounded-sm absolute left-0 top-0"
          style={{ width: `${progress}%`, background: 'var(--canon-purple-gradient)' }}
        />
        <div className="absolute inset-0 flex justify-between items-center">
          {milestones.map((m, i) => (
            <div
              key={i}
              className={cn(
                'w-[10px] h-[10px] rounded-full border-2 relative z-10',
                m.status === 'done' && 'bg-[var(--canon-purple)] border-[var(--bg-primary)]',
                m.status === 'current' && 'bg-[var(--text-primary)] border-[var(--canon-purple)] ring-2 ring-[var(--canon-purple)]',
                m.status === 'pending' && 'bg-[var(--border-tertiary)] border-[var(--bg-primary)]'
              )}
            />
          ))}
        </div>
      </div>
      <div className="flex justify-between">
        {milestones.map((m, i) => (
          <span
            key={i}
            className={cn(
              'text-[10px]',
              m.status === 'current' ? 'text-[var(--canon-purple)] font-medium' : 'text-[var(--text-tertiary)]'
            )}
          >
            {m.label}
          </span>
        ))}
      </div>
    </div>
  );
}
