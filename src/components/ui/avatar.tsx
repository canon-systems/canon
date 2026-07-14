const AVATAR_COLORS = [
  { background: 'var(--avatar-1)', foreground: 'var(--text-on-accent)' },
  { background: 'var(--avatar-2)', foreground: 'var(--text-primary)' },
  { background: 'var(--avatar-3)', foreground: 'var(--text-on-accent)' },
  { background: 'var(--avatar-4)', foreground: 'var(--text-primary)' },
  { background: 'var(--avatar-5)', foreground: 'var(--text-primary)' },
  { background: 'var(--avatar-6)', foreground: 'var(--text-on-accent)' },
  { background: 'var(--avatar-7)', foreground: 'var(--text-primary)' },
];

function getPalette(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

const sizes = {
  lg: 'w-11 h-11 type-card-title',
  md: 'w-[34px] h-[34px] type-body',
  sm: 'w-8 h-8 type-caption',
  xs: 'w-[26px] h-[26px] type-control-sm',
};

export function Avatar({ name, size = 'md' }: { name: string; size?: keyof typeof sizes }) {
  const palette = getPalette(name);

  return (
    <div
      className={`${sizes[size]} rounded-full flex items-center justify-center font-medium flex-shrink-0`}
      style={{ backgroundColor: palette.background, color: palette.foreground }}
    >
      {getInitials(name)}
    </div>
  );
}
