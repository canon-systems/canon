import type { HireRole, RoleProfile } from '@/types/onboarding';

export const DEFAULT_ROLES: HireRole[] = [
  'AI Solutions Architect',
  'Solutions Engineer',
  'Implementation Engineer',
];

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
  if (role === 'AI Solutions Architect') return 'var(--role-ai)';
  if (role === 'Solutions Engineer') return 'var(--role-se)';
  if (role === 'Implementation Engineer') return 'var(--role-ie)';
  return ROLE_COLORS[index % ROLE_COLORS.length];
}

export function activeRoleProfiles(profiles: RoleProfile[]) {
  return profiles
    .filter((profile) => profile.status !== 'archived')
    .sort((a, b) => (a.display_order - b.display_order) || a.role.localeCompare(b.role));
}
