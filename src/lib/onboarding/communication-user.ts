type CommunicationUserWithEmail = {
  email?: string | null;
};

export function resolvedCommunicationEmail(
  user: CommunicationUserWithEmail | null,
  fallbackEmail: string
) {
  return user?.email?.trim() || fallbackEmail.trim();
}
