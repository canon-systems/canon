export function canonicalProvider(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toLowerCase();
  if (!normalized) return '';
  return normalized;
}
