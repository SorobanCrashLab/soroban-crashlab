import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface KeyEncryptionProvider {
  encryptDataKey(dataKey: Uint8Array): Promise<{
    encryptedKey: Uint8Array;
    keyId: string;
  }>;

  decryptDataKey(encryptedKey: Uint8Array, keyId: string): Promise<Uint8Array>;
}

export interface EncryptedSecret {
  algorithm: 'aes-256-gcm';
  keyId: string;
  encryptedKey: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}

export async function encryptSecret(
  plaintext: Uint8Array,
  tenantId: string,
  keyProvider: KeyEncryptionProvider,
): Promise<EncryptedSecret> {
  const dataKey = randomBytes(32);
  const iv = randomBytes(12);
  const { encryptedKey, keyId } = await keyProvider.encryptDataKey(dataKey);

  const cipher = createCipheriv('aes-256-gcm', dataKey, iv);
  cipher.setAAD(Buffer.from(tenantId, 'utf8'));

  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    algorithm: 'aes-256-gcm',
    keyId,
    encryptedKey: Buffer.from(encryptedKey).toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export async function decryptSecret(
  record: EncryptedSecret,
  tenantId: string,
  keyProvider: KeyEncryptionProvider,
): Promise<Uint8Array> {
  const dataKey = await keyProvider.decryptDataKey(
    Buffer.from(record.encryptedKey, 'base64'),
    record.keyId,
  );

  const decipher = createDecipheriv(
    'aes-256-gcm',
    dataKey,
    Buffer.from(record.iv, 'base64'),
  );
  decipher.setAAD(Buffer.from(tenantId, 'utf8'));
  decipher.setAuthTag(Buffer.from(record.authTag, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, 'base64')),
    decipher.final(),
  ]);
}
