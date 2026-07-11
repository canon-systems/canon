export const DEFAULT_AUTH_REDIRECT = '/onboarding/workspace';

const BLOCKED_AUTH_PATHS = new Set(['/auth/confirm', '/auth/continue', '/login']);

function isBlockedAuthPath(pathname: string) {
  return BLOCKED_AUTH_PATHS.has(pathname) || pathname.startsWith('/auth/confirm/') || pathname.startsWith('/auth/continue/');
}

export function safeRedirectPath(value: string | null | undefined, fallback = DEFAULT_AUTH_REDIRECT) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, 'https://canon.local');
    if (parsed.origin !== 'https://canon.local') return fallback;
    if (isBlockedAuthPath(parsed.pathname)) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function loginPathForNext(next: string | null | undefined) {
  const safeNext = safeRedirectPath(next);
  return `/login?next=${encodeURIComponent(safeNext)}`;
}
