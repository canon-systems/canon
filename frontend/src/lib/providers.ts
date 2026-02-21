export const ATLASSIAN_PROVIDER = 'atlassian';

export function canonicalProvider(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'confluence') return ATLASSIAN_PROVIDER;
  return normalized;
}

