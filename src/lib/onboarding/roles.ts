import type { HireRole, RoleProfile } from '@/types/onboarding';

const ROLE_COLORS = [
  'var(--role-ai)',
  'var(--role-se)',
  'var(--role-ie)',
  'rgba(13, 148, 136, 0.18)',
  'rgba(107, 92, 231, 0.18)',
  'rgba(37, 99, 235, 0.18)',
  'rgba(217, 119, 6, 0.18)',
  'rgba(16, 185, 129, 0.18)',
];

const ROLE_ICON_COLORS = [
  '#0F766E',
  '#5B4BE0',
  '#1D4ED8',
  '#B45309',
  '#047857',
  '#7E22CE',
  '#BE123C',
  '#334155',
];

export function normalizeRoleName(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export function roleAbbreviation(role: HireRole) {
  const words = normalizeRoleName(role).split(' ').filter(Boolean);
  if (words.length === 0) return 'R';
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 3).map((word) => word[0]?.toUpperCase()).join('');
}

export function roleColor(role: HireRole, index = 0) {
  void role;
  return ROLE_COLORS[index % ROLE_COLORS.length];
}

export function roleIconColor(role: HireRole, index = 0) {
  void role;

  const normalizedIndex = ((index % ROLE_ICON_COLORS.length) + ROLE_ICON_COLORS.length) % ROLE_ICON_COLORS.length;
  return ROLE_ICON_COLORS[normalizedIndex];
}

export function activeRoleProfiles(profiles: RoleProfile[]) {
  return profiles
    .filter((profile) => profile.status !== 'archived')
    .sort((a, b) => (a.display_order - b.display_order) || a.role.localeCompare(b.role));
}
