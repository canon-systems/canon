'use client';

import { IconEdit, IconPlus } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import type { RampMilestone } from '@/types/onboarding';

export function MilestoneCard({
  milestone,
  onEdit,
}: {
  milestone: RampMilestone;
  onEdit: (milestone: RampMilestone) => void;
}) {
  const isCustom = milestone.organization_id !== null;

  return (
    <div
      className="rounded-[10px] overflow-visible transition-colors duration-[120ms] border"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border-tertiary)',
        borderLeft: isCustom ? '3px solid var(--canon-purple)' : undefined,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-secondary)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = isCustom ? 'var(--canon-purple)' : 'var(--border-tertiary)'; }}
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
          <StatusBadge variant={isCustom ? 'custom' : 'global'} />
          <Button type="button" size="icon" variant="ghost" onClick={() => onEdit(milestone)} aria-label="Edit Milestone">
            <IconEdit size={14} />
          </Button>
        </div>
      </div>

      <div className="px-5 pb-5 pt-4 border-t" style={{ borderColor: 'var(--border-tertiary)' }}>
        <p className="type-card-body" style={{ color: 'var(--text-secondary)' }}>{milestone.description}</p>
      </div>
    </div>
  );
}

export function AddMilestoneCard({ roleName, onAdd }: { roleName: string; onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="rounded-[10px] px-4 py-4 flex items-center justify-center gap-2 type-panel-title cursor-pointer border border-dashed transition-all duration-[120ms]"
      style={{ borderColor: 'var(--border-secondary)', color: 'var(--text-tertiary)' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--canon-purple)';
        e.currentTarget.style.color = 'var(--canon-purple)';
        e.currentTarget.style.backgroundColor = 'var(--canon-purple-light)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-secondary)';
        e.currentTarget.style.color = 'var(--text-tertiary)';
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      <IconPlus size={14} /> Add Milestone for {roleName}
    </button>
  );
}
