import { Card } from '@/components/ui/card';

type SettingsPlaceholderProps = {
  label: string;
};

export function SettingsPlaceholder({ label }: SettingsPlaceholderProps) {
  return (
    <Card className="max-w-2xl px-5 py-8 text-center">
      <div className="type-section-title" style={{ color: 'var(--text-secondary)' }}>{label}</div>
      <div className="type-body mt-2" style={{ color: 'var(--text-tertiary)' }}>This settings section is ready for configuration content.</div>
    </Card>
  );
}
