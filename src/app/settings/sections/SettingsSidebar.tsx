import {
  IconBuilding,
  IconPlug,
  IconUser,
  IconUsers,
} from '@tabler/icons-react';

import { cn } from '@/components/ui/utils';

const SETTINGS_TABS = ['profile', 'org', 'integrations', 'readiness', 'apikeys', 'delete'] as const;
export type SettingsTab = typeof SETTINGS_TABS[number];

const settingSections = [
  { section: 'Account', items: [{ id: 'profile', label: 'Profile', icon: IconUser }, { id: 'org', label: 'Organization', icon: IconBuilding }] },
  { section: 'Connections', items: [{ id: 'integrations', label: 'Integrations', icon: IconPlug }] },
  { section: 'Readiness', items: [{ id: 'readiness', label: 'Roles & Tools', icon: IconUsers }] },
] satisfies Array<{
  section: string;
  items: Array<{ id: SettingsTab; label: string; icon: typeof IconUser }>;
}>;

export function isSettingsTab(value: string | null): value is SettingsTab {
  return SETTINGS_TABS.includes(value as SettingsTab);
}

type SettingsSidebarProps = {
  activeSetting: SettingsTab;
  onSelect: (value: SettingsTab) => void;
};

export function SettingsSidebar({ activeSetting, onSelect }: SettingsSidebarProps) {
  return (
    <div className="split-sidebar w-[180px] flex-shrink-0 py-5 overflow-y-auto border-r">
      {settingSections.map(({ section, items }) => (
        <div key={section}>
          <div className="type-kicker px-4 pt-[10px] pb-1" style={{ color: 'var(--text-tertiary)' }}>
            {section}
          </div>
          {items.map((item) => {
            const Icon = item.icon;
            const selected = activeSetting === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={cn(
                  'flex w-[calc(100%-16px)] items-center gap-2 px-4 py-[7px] text-left type-nav mx-2 rounded-[5px] cursor-pointer border border-transparent transition-colors duration-[120ms]',
                  selected && 'nav-item-selected'
                )}
                style={{
                  color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: selected ? 500 : 400,
                }}
              >
                <Icon size={14} />
                {item.label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
