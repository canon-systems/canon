import { createServiceRoleClient } from '@/lib/supabase/server';
import { decryptSecret, encryptSecret, type EncryptedSecret } from '@/lib/server/oauth/tokenCrypto';

export const GONG_PROVIDER = 'gong';
export const DEFAULT_GONG_API_BASE_URL = 'https://api.gong.io';

type GongConnectionMetadata = {
  api_base_url?: unknown;
};

export type GongCredentials = {
  authorization: string;
  apiBaseUrl: string;
  connectionId: string;
};

function normalizeApiBaseUrl(value: string | null | undefined): string {
  const fallback = DEFAULT_GONG_API_BASE_URL;
  if (!value) return fallback;

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return fallback;
    return url.origin;
  } catch {
    return fallback;
  }
}

export function encodeGongCredentials(accessKey: string, accessKeySecret: string): EncryptedSecret {
  return encryptSecret(`${accessKey}:${accessKeySecret}`);
}

export function gongBasicAuthorization(encrypted: EncryptedSecret): string {
  return `Basic ${Buffer.from(decryptSecret(encrypted), 'utf8').toString('base64')}`;
}

export async function getGongCredentialsForUser(userId: string): Promise<GongCredentials | null> {
  const supabase = createServiceRoleClient();

  const { data: connection } = await supabase
    .from('oauth_connections')
    .select('connection_id, metadata')
    .eq('user_id', userId)
    .eq('provider', GONG_PROVIDER)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const connectionId = typeof connection?.connection_id === 'string' ? connection.connection_id : null;
  if (!connectionId) return null;

  const { data: tokenRow } = await supabase
    .from('oauth_provider_tokens')
    .select('access_token')
    .eq('provider', GONG_PROVIDER)
    .eq('connection_id', connectionId)
    .maybeSingle();

  const encrypted = tokenRow?.access_token as EncryptedSecret | undefined;
  if (!encrypted) return null;

  const metadata = connection?.metadata as GongConnectionMetadata | null;
  const apiBaseUrl = normalizeApiBaseUrl(
    typeof metadata?.api_base_url === 'string' ? metadata.api_base_url : null
  );

  return {
    authorization: gongBasicAuthorization(encrypted),
    apiBaseUrl,
    connectionId,
  };
}

export async function getGongCredentialsForOrganization(organizationId: string): Promise<GongCredentials | null> {
  const supabase = createServiceRoleClient();

  const { data: org } = await supabase
    .from('organizations')
    .select('owner_id')
    .eq('id', organizationId)
    .maybeSingle();

  const ownerId = typeof org?.owner_id === 'string' ? org.owner_id : null;
  if (!ownerId) return null;

  return getGongCredentialsForUser(ownerId);
}

export { normalizeApiBaseUrl };
