import crypto from 'node:crypto';

function getKey(): Buffer {
  const raw = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('Missing OAUTH_TOKEN_ENCRYPTION_KEY. Set it to a 32-byte base64 key.');
  }

  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('Invalid OAUTH_TOKEN_ENCRYPTION_KEY. Must decode to 32 bytes (base64).');
  }

  return key;
}

export type EncryptedSecret = {
  v: 1;
  alg: 'A256GCM';
  iv: string;
  tag: string;
  data: string;
};

export function encryptSecret(plaintext: string): EncryptedSecret {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    v: 1,
    alg: 'A256GCM',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  };
}

export function decryptSecret(payload: EncryptedSecret): string {
  if (!payload || payload.v !== 1 || payload.alg !== 'A256GCM') {
    throw new Error('Unsupported encrypted secret payload.');
  }

  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const data = Buffer.from(payload.data, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

