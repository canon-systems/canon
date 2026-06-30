const DOMAIN_NAME_MAX_LENGTH = 80;
const SOURCE_IDENTIFIER_MAX_LENGTH = 255;

export const PRESET_SOURCE_DOMAINS = [
  'Frontend',
  'Backend',
  'Billing',
  'Infrastructure',
  'Authentication',
  'Data',
  'Notifications',
  'Integrations',
  'DevOps',
] as const;

export const DEFAULT_SOURCE_DOMAIN = PRESET_SOURCE_DOMAINS[0];

export function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeDomainName(value: string): string {
  return collapseWhitespace(value).toLowerCase();
}

export function isPresetSourceDomainName(value: string): boolean {
  const normalized = normalizeDomainName(value);
  return PRESET_SOURCE_DOMAINS.some((domain) => normalizeDomainName(domain) === normalized);
}

export function canonicalizeDomainName(value: string): string {
  const normalized = normalizeDomainName(value);
  const preset = PRESET_SOURCE_DOMAINS.find((domain) => normalizeDomainName(domain) === normalized);
  const resolved = preset || collapseWhitespace(value);
  return resolved.slice(0, DOMAIN_NAME_MAX_LENGTH);
}

export function resolvePresetSourceDomain(value: string | null | undefined): string | null {
  const normalized = normalizeDomainName(value || '');
  if (!normalized) return null;
  return PRESET_SOURCE_DOMAINS.find((domain) => normalizeDomainName(domain) === normalized) || null;
}

export function resolveSourceDomainValue(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = collapseWhitespace(value);
  if (!normalized) return null;
  return canonicalizeDomainName(normalized);
}

function normalizeIdentifierPart(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeScopeValue(value: unknown): string {
  if (typeof value === 'string') return normalizeIdentifierPart(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).toLowerCase();
  return '';
}

function buildScopeFallback(scope: Record<string, unknown>): string {
  const pairs = Object.entries(scope)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${normalizeIdentifierPart(key)}=${normalizeScopeValue(value)}`)
    .filter((entry) => entry.length > 0);

  return pairs.join('|');
}

export function buildSourceIdentifier(params: {
  provider: string;
  scope: Record<string, unknown>;
  fallbackName?: string | null;
}): string {
  const provider = normalizeIdentifierPart(params.provider) || 'source';
  const scope = params.scope || {};

  if (provider === 'github') {
    const installationId = normalizeScopeValue(scope.installation_id);
    const repoId = normalizeScopeValue(scope.repo_id);
    if (installationId && repoId) {
      return `gh:${installationId}:${repoId}`.slice(0, SOURCE_IDENTIFIER_MAX_LENGTH);
    }
    const repo = normalizeIdentifierPart(scope.repo);
    if (repo) return repo.slice(0, SOURCE_IDENTIFIER_MAX_LENGTH);
  }

  const fallbackScope = buildScopeFallback(scope);
  if (fallbackScope) {
    return `${provider}:${fallbackScope}`.slice(0, SOURCE_IDENTIFIER_MAX_LENGTH);
  }

  const fallbackName = normalizeIdentifierPart(params.fallbackName || '');
  if (fallbackName) {
    return `${provider}:${fallbackName}`.slice(0, SOURCE_IDENTIFIER_MAX_LENGTH);
  }

  return `${provider}:unknown`;
}
