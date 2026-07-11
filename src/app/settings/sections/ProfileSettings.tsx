import type { User as SupabaseUser } from '@supabase/supabase-js';

import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { userFullName } from '@/lib/userDisplay';

type ProfileSettingsProps = {
  user: SupabaseUser | null;
};

export function ProfileSettings({ user }: ProfileSettingsProps) {
  const displayName = userFullName(user);
  const fields = [
    { label: 'Display Name', value: displayName, hint: 'Display name is finalized during onboarding.' },
    { label: 'Email', value: user?.email || '', hint: 'Email is managed by your authentication provider.' },
  ];

  return (
    <div className="max-w-2xl">
      <Card className="mb-4 flex items-center gap-[14px] px-[18px] py-4">
        <Avatar name={displayName} size="lg" />
        <div>
          <div className="type-card-title" style={{ color: 'var(--text-primary)' }}>{displayName}</div>
          <div className="type-page-subtitle mt-[2px]" style={{ color: 'var(--text-secondary)' }}>{user?.email || 'Not Available'}</div>
          <div className="type-caption mt-[2px] font-mono" style={{ color: 'var(--text-tertiary)' }}>{user?.id || 'N/A'}</div>
        </div>
      </Card>

      {fields.map((field) => (
        <div key={field.label} className="mb-[14px]">
          <label className="block type-body font-medium mb-[5px]" style={{ color: 'var(--text-secondary)' }}>
            {field.label}
          </label>
          <Input value={field.value} readOnly />
          <p className="type-caption mt-1" style={{ color: 'var(--text-tertiary)' }}>{field.hint}</p>
        </div>
      ))}
    </div>
  );
}
