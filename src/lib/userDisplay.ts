export type DisplayUser = {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

function metadataString(user: Pick<DisplayUser, 'user_metadata'> | null | undefined, key: string) {
  const value = user?.user_metadata?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function userFullName(user: DisplayUser | null | undefined) {
  const firstName = metadataString(user, 'first_name');
  const lastName = metadataString(user, 'last_name');
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

  return fullName ||
    metadataString(user, 'full_name') ||
    metadataString(user, 'name') ||
    user?.email?.split('@')[0]?.replace(/[._-]+/g, ' ').trim() ||
    'User';
}

export function initialsForName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U';
}
