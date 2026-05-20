const AVATAR_COLORS = [
  '#6B5CE7',
  '#0D9488',
  '#2563EB',
  '#E05D44',
  '#16A34A',
  '#9333EA',
  '#D97706',
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
  lg: 'w-11 h-11 text-[15px]',
  md: 'w-[34px] h-[34px] text-[12px]',
  sm: 'w-8 h-8 text-[11px]',
  xs: 'w-[26px] h-[26px] text-[10px]',
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
