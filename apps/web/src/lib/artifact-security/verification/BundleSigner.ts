/**
 * Bundle Signer
 * 
 * Signs crash bundles and other artifacts using Ed25519 keys.
 * Used by CrashLab core to sign artifacts before distribution.
 */

import { createSign, createPrivateKey, createPublicKey, generateKeyPairSync, KeyObject } from 'node:crypto';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { SigningKey } from './VerificationPolicy.js';

export interface SigningOptions {
  algorithm?: 'ed25519' | 'ecdsa-p256' | 'rsa-pss-sha256';
  keyPath?: string;
  passphrase?: string;
}

export interface SignedArtifact {
  artifactId: string;
  artifactHash: string; // SHA256 of artifact
  signature: string; // Base64 encoded
  publicKey: string; // PEM format
  keyId: string;
  algorithm: string;
  signedAt: string;
  expiresAt?: string;
  metadata: Record<string, string>;
}

export interface KeyPair {
  privateKey: KeyObject;
  publicKey: KeyObject;
  privateKeyPem: string;
  publicKeyPem: string;
  keyId: string;
}

export class BundleSigner {
  private keyPair: KeyPair | null = null;
  private defaultAlgorithm: 'ed25519' | 'ecdsa-p256' | 'rsa-pss-sha256' = 'ed25519';

  constructor(options: SigningOptions = {}) {
    this.defaultAlgorithm = options.algorithm || 'ed25519';
    
    if (options.keyPath) {
      this.loadKey(options.keyPath, options.passphrase);
    }
  }

  /**
   * Generate a new Ed25519 key pair
   */
  static generateKeyPair(algorithm: 'ed25519' | 'ecdsa-p256' = 'ed25519'): KeyPair {
    const { privateKey, publicKey } = generateKeyPairSync(algorithm);
    
    const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' }).toString();
    
    // Generate key ID from public key
    const der = publicKey.export({ format: 'der', type: 'spki' });
    const crypto = require('node:crypto');
    const hash = crypto.createHash('sha256').update(der).digest('hex');
    const keyId = `${algorithm}:${hash.substring(0, 16)}`;

    return { privateKey, publicKey, privateKeyPem, publicKeyPem, keyId };
  }

  /**
   * Save key pair to files
   */
  static async saveKeyPair(
    keyPair: KeyPair,
    privateKeyPath: string,
    publicKeyPath: string
  ): Promise<void> {
    await mkdir(dirname(privateKeyPath), { recursive: true });
    await mkdir(dirname(publicKeyPath), { recursive: true });
    
    await writeFile(privateKeyPath, keyPair.privateKeyPem, { mode: 0o600 });
    await writeFile(publicKeyPath, keyPair.publicKeyPem, { mode: 0o644 });
  }

  /**
   * Load key pair from files
   */
  loadKey(privateKeyPath: string, passphrase?: string): void {
    const privateKeyPem = require('node:fs').readFileSync(privateKeyPath, 'utf-8');
    const privateKey = createPrivateKey({ key: privateKeyPem, format: 'pem', passphrase });
    
    // Derive public key from private key
    const publicKey = createPublicKey({ key: privateKeyPem, format: 'pem' });
    const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' }).toString();
    
    const der = publicKey.export({ format: 'der', type: 'spki' });
    const crypto = require('node:crypto');
    const hash = crypto.createHash('sha256').update(der).digest('hex');
    const keyId = `${this.defaultAlgorithm}:${hash.substring(0, 16)}`;

    this.keyPair = { privateKey, publicKey, privateKeyPem, publicKeyPem, keyId };
  }

  /**
   * Set key pair directly
   */
  setKeyPair(keyPair: KeyPair): void {
    this.keyPair = keyPair;
  }

  /**
   * Get current key ID
   */
  getKeyId(): string | null {
    return this.keyPair?.keyId || null;
  }

  /**
   * Get public key PEM
   */
  getPublicKeyPem(): string | null {
    return this.keyPair?.publicKeyPem || null;
  }

  /**
   * Sign an artifact buffer
   */
  async signBuffer(buffer: Buffer, metadata: Record<string, string> = {}): Promise<SignedArtifact> {
    if (!this.keyPair) {
      throw new Error('No signing key loaded');
    }

    const crypto = require('node:crypto');
    const artifactHash = crypto.createHash('sha256').update(buffer).digest('hex');
    
    const sign = createSign('sha256');
    sign.update(buffer);
    sign.end();

    const signature = sign.sign(this.keyPair.privateKey);
    const signatureB64 = signature.toString('base64');

    return {
      artifactId: metadata.artifactId || `artifact-${Date.now()}`,
      artifactHash,
      signature: signatureB64,
      publicKey: this.keyPair.publicKeyPem,
      keyId: this.keyPair.keyId,
      algorithm: this.defaultAlgorithm,
      signedAt: new Date().toISOString(),
      metadata,
    };
  }

  /**
   * Sign an artifact file
   */
  async signFile(filePath: string, metadata: Record<string, string> = {}): Promise<SignedArtifact> {
    const buffer = await readFile(filePath);
    return this.signBuffer(buffer, { ...metadata, filePath });
  }

  /**
   * Save signature to file
   */
  async saveSignature(signedArtifact: SignedArtifact, outputPath: string): Promise<void> {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(signedArtifact, null, 2));
  }

  /**
   * Create a detached signature file
   */
  async createDetachedSignature(buffer: Buffer, signaturePath: string): Promise<void> {
    if (!this.keyPair) {
      throw new Error('No signing key loaded');
    }

    const sign = createSign('sha256');
    sign.update(buffer);
    sign.end();

    const signature = sign.sign(this.keyPair.privateKey);
    await mkdir(dirname(signaturePath), { recursive: true });
    await writeFile(signaturePath, signature);
  }

  /**
   * Verify a signature (using public key)
   */
  static async verifySignature(
    buffer: Buffer,
    signatureB64: string,
    publicKeyPem: string
  ): Promise<boolean> {
    try {
      const publicKey = createPublicKey({ key: publicKeyPem, format: 'pem', type: 'spki' });
      const signature = Buffer.from(signatureB64, 'base64');
      
      const verify = createSign('sha256'); // Use createVerify in real implementation
      // Actually need createVerify:
      const { createVerify } = require('node:crypto');
      const verifyObj = createVerify('sha256');
      verifyObj.update(buffer);
      verifyObj.end();
      
      return verifyObj.verify(publicKey, signature);
    } catch {
      return false;
    }
  }

  /**
   * Sign and create a complete signed artifact package
   */
  async createSignedPackage(
    artifactPath: string,
    outputDir: string,
    metadata: Record<string, string> = {}
  ): Promise<{ artifactPath: string; signaturePath: string; publicKeyPath: string }> {
    const buffer = await readFile(artifactPath);
    const signed = await this.signBuffer(buffer, metadata);
    
    const baseName = join(outputDir, signed.artifactId);
    const artifactOut = `${baseName}.artifact`;
    const signatureOut = `${baseName}.sig`;
    const publicKeyOut = `${baseName}.pub`;
    const metadataOut = `${baseName}.json`;

    await Promise.all([
      writeFile(artifactOut, buffer),
      writeFile(signatureOut, Buffer.from(signed.signature, 'base64')),
      writeFile(publicKeyOut, signed.publicKey),
      writeFile(metadataOut, JSON.stringify(signed, null, 2)),
    ]);

    return {
      artifactPath: artifactOut,
      signaturePath: signatureOut,
      publicKeyPath: publicKeyOut,
    };
  }
}

/**
 * Create a bundle signer with a generated key pair
 */
export function createBundleSigner(
  algorithm: 'ed25519' | 'ecdsa-p256' = 'ed25519'
): { signer: BundleSigner; keyPair: KeyPair } {
  const keyPair = BundleSigner.generateKeyPair(algorithm);
  const signer = new BundleSigner({ algorithm });
  signer.setKeyPair(keyPair);
  return { signer, keyPair };
}

/**
 * CrashLab Core Signer - uses well-known key for core-signed artifacts
 */
export class CrashLabCoreSigner extends BundleSigner {
  private static instance: CrashLabCoreSigner | null = null;
  private coreKeyId = 'crashlab-core@soroban-crashlab';

  private constructor() {
    super({ algorithm: 'ed25519' });
  }

  static getInstance(): CrashLabCoreSigner {
    if (!CrashLabCoreSigner.instance) {
      CrashLabCoreSigner.instance = new CrashLabCoreSigner();
    }
    return CrashLabCoreSigner.instance;
  }

  static async initializeFromEnv(): Promise<CrashLabCoreSigner> {
    const instance = CrashLabCoreSigner.getInstance();
    
    const keyPath = process.env.CRASHLAB_CORE_SIGNING_KEY;
    if (keyPath) {
      instance.loadKey(keyPath, process.env.CRASHLAB_CORE_SIGNING_KEY_PASSPHRASE);
    } else {
      // Generate ephemeral key for development
      const { keyPair } = createBundleSigner('ed25519');
      instance.setKeyPair(keyPair);
      console.warn('Using ephemeral signing key - set CRASHLAB_CORE_SIGNING_KEY for production');
    }
    
    return instance;
  }

  getCoreKeyId(): string {
    return this.coreKeyId;
  }

  async signCrashBundle(
    bundle: object,
    metadata: Record<string, string> = {}
  ): Promise<SignedArtifact> {
    const buffer = Buffer.from(JSON.stringify(bundle, null, 2));
    return this.signBuffer(buffer, {
      ...metadata,
      artifactType: 'crash-bundle',
      signedBy: this.coreKeyId,
    });
  }
}