import { createServiceRoleClient } from '@/lib/supabase/server';
import { decryptSecret, type EncryptedSecret } from '@/lib/server/oauth/tokenCrypto';

export async function getProviderAccessToken(params: {
  provider: string;
  connectionId: string;
}): Promise<string | null> {
  const { provider, connectionId } = params;
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from('oauth_provider_tokens')
    .select('access_token')
    .eq('provider', provider)
    .eq('connection_id', connectionId)
    .maybeSingle();

  if (error || !data) return null;

  const encrypted = data.access_token as EncryptedSecret | undefined;
  if (!encrypted) return null;

  return decryptSecret(encrypted);
}

