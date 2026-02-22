import crypto from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { decryptSecret, encryptSecret, type EncryptedSecret } from '@/lib/server/oauth/tokenCrypto';

const TOKEN_BYTES = 24;
const SECRET_BYTES = 32;
const ATLASSIAN_PROVIDER = 'atlassian';
const METADATA_TOKEN_KEY = 'jira_webhook_token';
const METADATA_SECRET_KEY = 'jira_webhook_secret_encrypted';

function generateToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

function generateSecret(): string {
  return crypto.randomBytes(SECRET_BYTES).toString('base64url');
}

function asEncryptedSecret(value: unknown): EncryptedSecret | null {
  if (
    value &&
    typeof value === 'object' &&
    (value as EncryptedSecret).v === 1 &&
    (value as EncryptedSecret).alg === 'A256GCM' &&
    typeof (value as EncryptedSecret).iv === 'string' &&
    typeof (value as EncryptedSecret).tag === 'string' &&
    typeof (value as EncryptedSecret).data === 'string'
  ) {
    return value as EncryptedSecret;
  }
  return null;
}

/**
 * Get or create a Jira webhook secret for the user.
 * Stored in oauth_connections.metadata for the Atlassian connection.
 * Returns plaintext secret and webhook token for URL (?t=...).
 */
export async function getOrCreateJiraWebhookSecret(userId: string): Promise<{
  webhookToken: string;
  secretPlaintext: string;
}> {
  const supabase = createServiceRoleClient();
  const { data: connection, error: readError } = await supabase
    .from('oauth_connections')
    .select('connection_id, metadata')
    .eq('user_id', userId)
    .eq('provider', ATLASSIAN_PROVIDER)
    .eq('status', 'active')
    .maybeSingle();

  if (readError) {
    throw new Error(`Failed to read Atlassian connection: ${readError.message}`);
  }
  if (!connection?.connection_id) {
    throw new Error('No active Atlassian connection. Connect Atlassian in Settings first.');
  }

  const metadata =
    connection.metadata && typeof connection.metadata === 'object'
      ? (connection.metadata as Record<string, unknown>)
      : {};
  const existingToken =
    typeof metadata[METADATA_TOKEN_KEY] === 'string' ? (metadata[METADATA_TOKEN_KEY] as string) : null;
  const existingEnc = metadata[METADATA_SECRET_KEY];

  if (existingToken && existingEnc) {
    const enc = asEncryptedSecret(existingEnc);
    if (enc) {
      const plaintext = decryptSecret(enc);
      return { webhookToken: existingToken, secretPlaintext: plaintext };
    }
  }

  const webhookToken = generateToken();
  const secretPlaintext = generateSecret();
  const secretEncrypted = encryptSecret(secretPlaintext);

  const { error: updateError } = await supabase
    .from('oauth_connections')
    .update({
      metadata: {
        ...metadata,
        [METADATA_TOKEN_KEY]: webhookToken,
        [METADATA_SECRET_KEY]: secretEncrypted as unknown as Record<string, unknown>,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('provider', ATLASSIAN_PROVIDER);

  if (updateError) {
    throw new Error(`Failed to store Jira webhook secret: ${updateError.message}`);
  }

  return { webhookToken, secretPlaintext };
}

/**
 * Resolve webhook secret by URL token (for incoming webhook requests).
 * Looks up oauth_connections where metadata.jira_webhook_token = token.
 * Returns plaintext secret if found.
 */
export async function getJiraWebhookSecretByToken(token: string | null): Promise<string | null> {
  if (!token || typeof token !== 'string' || token.trim().length === 0) return null;
  const needle = token.trim();
  const supabase = createServiceRoleClient();
  const { data: rows, error } = await supabase
    .from('oauth_connections')
    .select('metadata')
    .eq('provider', ATLASSIAN_PROVIDER)
    .eq('status', 'active');

  if (error || !Array.isArray(rows)) return null;
  const connection = rows.find((row) => {
    const meta = row?.metadata && typeof row.metadata === 'object' ? (row.metadata as Record<string, unknown>) : {};
    return meta[METADATA_TOKEN_KEY] === needle;
  });
  if (!connection?.metadata || typeof connection.metadata !== 'object') return null;
  const meta = connection.metadata as Record<string, unknown>;
  const enc = meta[METADATA_SECRET_KEY];
  const parsed = asEncryptedSecret(enc);
  if (!parsed) return null;
  try {
    return decryptSecret(parsed);
  } catch {
    return null;
  }
}
