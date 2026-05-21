const AVATAR_COLORS = [
  'var(--avatar-1)',
  'var(--avatar-2)',
  'var(--avatar-3)',
  'var(--avatar-4)',
  'var(--avatar-5)',
  'var(--avatar-6)',
  'var(--avatar-7)',
];

function getColor(name: string): string {
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
  return (
    <div
      className={`${sizes[size]} rounded-full flex items-center justify-center font-medium text-[var(--text-primary)] flex-shrink-0`}
      style={{ backgroundColor: getColor(name) }}
    >
      {getInitials(name)}
    </div>
  );
}
