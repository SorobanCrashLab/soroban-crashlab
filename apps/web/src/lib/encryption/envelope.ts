import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const TAG_LENGTH = 16;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;

export interface EncryptedRecord {
  ciphertext: string;
  iv: string;
  tag: string;
  salt: string;
  wrapped_dek: string;
}

export interface EnvelopeConfig {
  current_key_id: string;
  previous_key_id?: string;
}

let masterKeys: Map<string, Buffer> = new Map();
let envelopeConfig: EnvelopeConfig = {
  current_key_id: 'default',
};

export function setMasterKey(keyId: string, key: Buffer): void {
  if (key.length !== 32) {
    throw new Error('Master key must be 32 bytes for AES-256');
  }
  masterKeys.set(keyId, key);
}

export function getMasterKey(keyId: string): Buffer | undefined {
  return masterKeys.get(keyId);
}

export function getCurrentKeyId(): string {
  return envelopeConfig.current_key_id;
}

export function getPreviousKeyId(): string | undefined {
  return envelopeConfig.previous_key_id;
}

function deriveKeyEncryptionKey(masterKey: Buffer, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(masterKey, salt, 100000, 32, 'sha256');
}

function wrapDek(dek: Buffer, masterKey: Buffer, salt: Buffer): Buffer {
  const kek = deriveKeyEncryptionKey(masterKey, salt);
  const cipher = crypto.createCipheriv('aes-256-ecb', kek, null);
  return Buffer.concat([cipher.update(dek), cipher.final()]);
}

function unwrapDek(wrappedDek: Buffer, masterKey: Buffer, salt: Buffer): Buffer {
  const kek = deriveKeyEncryptionKey(masterKey, salt);
  const decipher = crypto.createDecipheriv('aes-256-ecb', kek, null);
  return Buffer.concat([decipher.update(wrappedDek), decipher.final()]);
}

export function encryptRecord(
  recordId: string,
  purpose: string,
  plaintext: string,
): EncryptedRecord {
  const currentKeyId = getCurrentKeyId();
  const masterKey = getMasterKey(currentKeyId);
  if (!masterKey) {
    throw new Error(`Master key ${currentKeyId} not configured`);
  }

  const salt = crypto.randomBytes(SALT_LENGTH);
  const dek = crypto.randomBytes(32);
  const iv = crypto.randomBytes(IV_LENGTH);
  const aad = Buffer.from(`${recordId}:${purpose}`, 'utf-8');

  const cipher = crypto.createCipheriv(ALGORITHM, dek, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const wrappedDek = wrapDek(dek, masterKey, salt);

  return {
    ciphertext: ciphertext.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    salt: salt.toString('hex'),
    wrapped_dek: wrappedDek.toString('hex'),
  };
}

export function decryptRecord(
  recordId: string,
  purpose: string,
  encrypted: EncryptedRecord,
): string {
  const currentKeyId = getCurrentKeyId();
  const previousKeyId = getPreviousKeyId();
  const salt = Buffer.from(encrypted.salt, 'hex');
  const wrappedDek = Buffer.from(encrypted.wrapped_dek, 'hex');

  for (const keyId of [currentKeyId, previousKeyId].filter((k) => k !== undefined)) {
    const masterKey = getMasterKey(keyId!);
    if (!masterKey) continue;

    try {
      const dek = unwrapDek(wrappedDek, masterKey, salt);
      const aad = Buffer.from(`${recordId}:${purpose}`, 'utf-8');
      const decipher = crypto.createDecipheriv(
        ALGORITHM,
        dek,
        Buffer.from(encrypted.iv, 'hex'),
      );
      decipher.setAAD(aad);
      decipher.setAuthTag(Buffer.from(encrypted.tag, 'hex'));
      return decipher.update(encrypted.ciphertext, 'hex', 'utf-8') + decipher.final('utf-8');
    } catch {
      continue;
    }
  }

  throw new Error('Failed to decrypt record: no valid master key found or integrity check failed');
}

export function rotateMasterKey(newKeyId: string, newKey: Buffer): void {
  const currentKeyId = getCurrentKeyId();
  setMasterKey(newKeyId, newKey);
  envelopeConfig = {
    current_key_id: newKeyId,
    previous_key_id: currentKeyId,
  };
}

export function resetEncryption(): void {
  masterKeys.clear();
  envelopeConfig = {
    current_key_id: 'default',
  };
}
