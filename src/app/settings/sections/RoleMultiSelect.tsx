import { Check, ChevronDown } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/components/ui/utils';
import { roleAbbreviation, roleColor } from '@/lib/onboarding/roles';
import type { HireRole } from '@/types/onboarding';

function toggleRoleSelection(currentRoles: HireRole[], role: HireRole) {
  if (currentRoles.includes(role)) return currentRoles.filter((selectedRole) => selectedRole !== role);
  return [...currentRoles, role];
}

export function selectedRolesLabel(roles: HireRole[]) {
  if (roles.length === 0) return 'All roles';
  if (roles.length === 1) return roles[0];
  return roles.map((role) => roleAbbreviation(role)).join(', ');
}

const roleSelectTriggerClass = cn(
  'flex h-9 w-full items-center justify-between gap-2 rounded-[7px] border px-[10px] py-[6px] type-field transition-colors duration-[120ms]',
  'border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)]',
  'hover:border-[var(--border-secondary)] focus:border-[var(--canon-purple)] focus:outline-none focus:ring-2 focus:ring-[var(--canon-purple)]/25'
);

function roleSelectOptionClass(selected: boolean, selectedClass = 'bg-[var(--bg-secondary)] text-[var(--text-primary)]') {
  return cn(
    'flex w-full items-center justify-between rounded-md px-3 py-[7px] text-left type-field transition-colors duration-[120ms]',
    selected
      ? selectedClass
      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'
  );
}

type RoleMultiSelectProps = {
  value: HireRole[];
  onChange: (roles: HireRole[]) => void;
  roles: HireRole[];
};

export function RoleMultiSelect({ value, onChange, roles }: RoleMultiSelectProps) {
  const allRolesSelected = value.length === 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={roleSelectTriggerClass}>
          <span className="truncate">{selectedRolesLabel(value)}</span>
          <ChevronDown size={14} className="flex-shrink-0 text-[var(--text-secondary)]" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-1">
        <button
          type="button"
          onClick={() => onChange([])}
          aria-pressed={allRolesSelected}
          className={roleSelectOptionClass(allRolesSelected, 'bg-[var(--green-bg)] text-[var(--green-text)]')}
        >
          <span>All roles</span>
          {allRolesSelected && <Check size={14} />}
        </button>

        <div className="my-1 h-px bg-[var(--border-tertiary)]" />

        {roles.map((role, index) => {
          const selected = value.includes(role);
          return (
            <button
              key={role}
              type="button"
              onClick={() => onChange(toggleRoleSelection(value, role))}
              aria-pressed={selected}
              className={roleSelectOptionClass(selected)}
            >
              <span>{role}</span>
              {selected && <Check size={14} style={{ color: roleColor(role, index) }} />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
