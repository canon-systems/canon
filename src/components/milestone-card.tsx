'use client';

import { MoreVertical as IconDotsVertical, Pencil as IconEdit, Trash2 as IconTrash } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { RampMilestone } from '@/types/onboarding';

export function MilestoneCard({
  milestone,
  onEdit,
  onDelete,
  deleting,
}: {
  milestone: RampMilestone;
  onEdit: (milestone: RampMilestone) => void;
  onDelete: (milestone: RampMilestone) => void;
  deleting?: boolean;
}) {
  return (
    <div
      className="rounded-[10px] overflow-visible transition-colors duration-[120ms] border"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border-tertiary)',
        borderLeft: '3px solid var(--canon-purple)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-secondary)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--canon-purple)'; }}
    >
      <div className="flex items-start gap-3 px-5 pt-4 pb-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className="type-caption font-medium px-[9px] py-[3px] rounded-[5px] flex-shrink-0 whitespace-nowrap mt-[1px]"
            style={{ backgroundColor: 'var(--canon-purple-light)', color: 'var(--canon-purple-dark)' }}
          >
            Day {milestone.day_trigger}
          </span>
          <span className="min-w-0 type-card-title" style={{ color: 'var(--text-primary)' }}>{milestone.title}</span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-[6px]">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={deleting}
                aria-label={`Open actions for ${milestone.title}`}
                className="w-7 h-7 rounded-md border border-[var(--border-tertiary)] bg-transparent flex items-center justify-center cursor-pointer text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] transition-colors duration-[120ms] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <IconDotsVertical size={15} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(milestone)}>
                <IconEdit size={14} />
                Edit Milestone
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-[var(--red-text)] focus:text-[var(--red-text)]" onClick={() => onDelete(milestone)}>
                <IconTrash size={14} />
                Remove Milestone
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="px-5 pb-5 pt-4 border-t" style={{ borderColor: 'var(--border-tertiary)' }}>
        <p className="type-card-body" style={{ color: 'var(--text-secondary)' }}>
          {milestone.capability_outcome ?? milestone.description}
        </p>
        {milestone.real_work_trigger && (
          <div className="mt-3 rounded-[8px] bg-[var(--bg-secondary)] px-3 py-2">
            <div className="type-kicker mb-1" style={{ color: 'var(--text-tertiary)' }}>Real Work Trigger</div>
            <p className="type-body" style={{ color: 'var(--text-secondary)' }}>{milestone.real_work_trigger}</p>
          </div>
        )}
      </div>
    </div>
  );
}
