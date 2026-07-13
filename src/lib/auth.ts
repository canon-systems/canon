import { auth } from '@clerk/nextjs/server';

export type CanonUser = {
  id: string;
  email: string;
  user_metadata: Record<string, string>;
};

function claimString(claims: Record<string, unknown>, key: string) {
  const value = claims[key];
  return typeof value === 'string' ? value.trim() : '';
}

function metadataFromClaims(claims: Record<string, unknown>) {
  const firstName = claimString(claims, 'first_name') || claimString(claims, 'given_name');
  const lastName = claimString(claims, 'last_name') || claimString(claims, 'family_name');
  const fullName = claimString(claims, 'name') || [firstName, lastName].filter(Boolean).join(' ');

  return {
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    name: fullName,
  };
}

export async function getSession() {
  const authState = await auth();
  if (!authState.userId) {
    return { user: null, session: null };
  }

  const claims = (authState.sessionClaims ?? {}) as Record<string, unknown>;
  const email =
    claimString(claims, 'email') ||
    claimString(claims, 'email_address') ||
    claimString(claims, 'primary_email_address');

  return {
    user: {
      id: authState.userId,
      email,
      user_metadata: metadataFromClaims(claims),
    } satisfies CanonUser,
    session: {
      id: authState.sessionId,
      orgId: authState.orgId,
      orgRole: authState.orgRole,
    },
  };
}
