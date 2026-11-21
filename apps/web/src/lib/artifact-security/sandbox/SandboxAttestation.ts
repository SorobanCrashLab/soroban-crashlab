/**
 * Sandbox Attestation
 * 
 * Generates and verifies cryptographic attestations for sandboxed executions.
 * Provides tamper-proof evidence of execution results and environment.
 */

import { createSign, createVerify, createPrivateKey, createPublicKey, generateKeyPairSync, KeyObject } from 'node:crypto';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { v4 as uuidv4 } from 'uuid';

export interface AttestationKeyPair {
  privateKey: KeyObject;
  publicKey: KeyObject;
  privateKeyPem: string;
  publicKeyPem: string;
  keyId: string;
}

export interface SandboxAttestation {
  id: string;
  version: string;
  timestamp: string;
  sandbox: SandboxIdentity;
  execution: ExecutionDetails;
  measurements: Measurement[];
  policy: PolicyReference;
  signature: string;
  publicKey: string;
  keyId: string;
}

export interface SandboxIdentity {
  runtime: string;
  runtimeVersion: string;
  profile: string;
  profileHash: string;
  hostId: string;
  instanceId: string;
}

export interface ExecutionDetails {
  image: string;
  imageDigest: string;
  command: string[];
  args: string[];
  environment: Record<string, string>;
  workingDir: string;
  user: string;
  startTime: string;
  endTime: string;
  exitCode: number;
  durationMs: number;
}

export interface Measurement {
  name: string;
  value: string;
  type: 'hash' | 'counter' | 'gauge' | 'timer' | 'pcr';
  pcrIndex?: number; // For TPM measurements
}

export interface PolicyReference {
  policyId: string;
  policyVersion: string;
  policyHash: string;
  rules: string[];
}

export interface VerificationResult {
  valid: boolean;
  attestation: SandboxAttestation | null;
  errors: string[];
  warnings: string[];
}

export class SandboxAttestationService {
  private keyPair: AttestationKeyPair | null = null;
  private keyPath: string;
  private passphrase?: string;

  constructor(keyPath: string = '/etc/crashlab/attestation/key.pem', passphrase?: string) {
    this.keyPath = keyPath;
    this.passphrase = passphrase;
  }

  /**
   * Initialize attestation service
   */
  async initialize(): Promise<void> {
    try {
      await this.loadKey();
    } catch {
      // Generate new key if not found
      await this.generateKey();
    }
  }

  /**
   * Generate new attestation key pair
   */
  async generateKey(): Promise<AttestationKeyPair> {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    
    const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' }).toString();
    
    const der = publicKey.export({ format: 'der', type: 'spki' });
    const crypto = await import('node:crypto');
    const hash = crypto.createHash('sha256').update(der).digest('hex');
    const keyId = `attest:${hash.substring(0, 16)}`;

    this.keyPair = { privateKey, publicKey, privateKeyPem, publicKeyPem, keyId };

    // Save to disk
    await mkdir(dirname(this.keyPath), { recursive: true });
    await writeFile(this.keyPath, privateKeyPem, { mode: 0o600 });
    await writeFile(this.keyPath.replace('.pem', '.pub'), publicKeyPem, { mode: 0o644 });

    return this.keyPair;
  }

  /**
   * Load existing key
   */
  async loadKey(): Promise<void> {
    const privateKeyPem = await readFile(this.keyPath, 'utf-8');
    const privateKey = createPrivateKey({ key: privateKeyPem, format: 'pem', passphrase: this.passphrase });
    
    const publicKey = createPublicKey({ key: privateKeyPem, format: 'pem' });
    const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' }).toString();
    
    const der = publicKey.export({ format: 'der', type: 'spki' });
    const crypto = await import('node:crypto');
    const hash = crypto.createHash('sha256').update(der).digest('hex');
    const keyId = `attest:${hash.substring(0, 16)}`;

    this.keyPair = { privateKey, publicKey, privateKeyPem, publicKeyPem, keyId };
  }

  /**
   * Get public key PEM
   */
  getPublicKeyPem(): string | null {
    return this.keyPair?.publicKeyPem || null;
  }

  /**
   * Get key ID
   */
  getKeyId(): string | null {
    return this.keyPair?.keyId || null;
  }

  /**
   * Create attestation for execution
   */
  async createAttestation(
    sandbox: SandboxIdentity,
    execution: ExecutionDetails,
    measurements: Measurement[],
    policy: PolicyReference
  ): Promise<SandboxAttestation> {
    if (!this.keyPair) {
      throw new Error('Attestation key not initialized');
    }

    const attestation: SandboxAttestation = {
      id: uuidv4(),
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      sandbox,
      execution,
      measurements,
      policy,
      signature: '',
      publicKey: this.keyPair.publicKeyPem,
      keyId: this.keyPair.keyId,
    };

    // Sign the attestation
    attestation.signature = this.signAttestation(attestation);

    return attestation;
  }

  /**
   * Sign attestation
   */
  private signAttestation(attestation: Omit<SandboxAttestation, 'signature'>): string {
    if (!this.keyPair) throw new Error('No key pair');

    const payload = this.canonicalizeAttestation(attestation);
    const sign = createSign('sha256');
    sign.update(payload);
    sign.end();
    
    return sign.sign(this.keyPair.privateKey).toString('base64');
  }

  /**
   * Canonicalize attestation for signing
   */
  private canonicalizeAttestation(attestation: Omit<SandboxAttestation, 'signature'>): string {
    // Create deterministic JSON for signing
    return JSON.stringify({
      id: attestation.id,
      version: attestation.version,
      timestamp: attestation.timestamp,
      sandbox: attestation.sandbox,
      execution: attestation.execution,
      measurements: attestation.measurements,
      policy: attestation.policy,
    });
  }

  /**
   * Verify attestation
   */
  async verifyAttestation(attestation: SandboxAttestation, trustedKeys?: string[]): Promise<VerificationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check key ID is trusted
    if (trustedKeys && trustedKeys.length > 0) {
      if (!trustedKeys.includes(attestation.keyId)) {
        errors.push(`Untrusted key ID: ${attestation.keyId}`);
      }
    }

    // Verify signature
    try {
      const publicKey = createPublicKey({ key: attestation.publicKey, format: 'pem', type: 'spki' });
      const verify = createVerify('sha256');
      
      const payload = this.canonicalizeAttestation(attestation);
      verify.update(payload);
      verify.end();
      
      const signature = Buffer.from(attestation.signature, 'base64');
      const valid = verify.verify(publicKey, signature);
      
      if (!valid) {
        errors.push('Invalid signature');
      }
    } catch (error) {
      errors.push(`Signature verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Check timestamp freshness (optional)
    const attestationTime = new Date(attestation.timestamp).getTime();
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    if (now - attestationTime > maxAge) {
      warnings.push(`Attestation older than ${maxAge / 1000 / 60} minutes`);
    }

    // Verify measurement consistency
    for (const measurement of attestation.measurements) {
      if (measurement.type === 'hash' && measurement.value.length !== 64) {
        warnings.push(`Measurement ${measurement.name} has unexpected hash length`);
      }
    }

    return {
      valid: errors.length === 0,
      attestation: errors.length === 0 ? attestation : null,
      errors,
      warnings,
    };
  }

  /**
   * Save attestation to file
   */
  async saveAttestation(attestation: SandboxAttestation, outputPath: string): Promise<void> {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(attestation, null, 2));
  }

  /**
   * Load attestation from file
   */
  async loadAttestation(filePath: string): Promise<SandboxAttestation> {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Create attestation from sandbox execution result
   */
  static async fromExecutionResult(
    attestationService: SandboxAttestationService,
    result: any, // ExecutionResult from SandboxManager
    profile: any, // SandboxProfileConfig
    policy: any // PolicyReference
  ): Promise<SandboxAttestation> {
    const sandbox: SandboxIdentity = {
      runtime: 'gvisor', // Would be detected
      runtimeVersion: 'unknown',
      profile: profile.name,
      profileHash: await SandboxAttestationService.hashObject(profile),
      hostId: await SandboxAttestationService.getHostId(),
      instanceId: result.attestation?.sandboxId || 'unknown',
    };

    const execution: ExecutionDetails = {
      image: result.attestation?.image || 'unknown',
      imageDigest: 'unknown', // Would be computed
      command: result.attestation?.command || [],
      args: [],
      environment: {},
      workingDir: profile.workingDir,
      user: profile.user,
      startTime: new Date(Date.now() - result.durationMs).toISOString(),
      endTime: new Date().toISOString(),
      exitCode: result.exitCode,
      durationMs: result.durationMs,
    };

    const measurements: Measurement[] = [
      { name: 'cpu_time_ms', value: String(result.resourceUsage.cpuTimeMs), type: 'counter' },
      { name: 'memory_bytes', value: String(result.resourceUsage.memoryBytes), type: 'gauge' },
      { name: 'peak_memory_bytes', value: String(result.resourceUsage.peakMemoryBytes), type: 'gauge' },
      { name: 'duration_ms', value: String(result.durationMs), type: 'timer' },
      { name: 'exit_code', value: String(result.exitCode), type: 'counter' },
    ];

    return attestationService.createAttestation(sandbox, execution, measurements, policy);
  }

  /**
   * Hash an object deterministically
   */
  static async hashObject(obj: any): Promise<string> {
    const crypto = await import('node:crypto');
    const canonical = JSON.stringify(obj, Object.keys(obj).sort());
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  /**
   * Get host identifier
   */
  static async getHostId(): Promise<string> {
    try {
      const { readFile } = await import('node:fs/promises');
      const content = await readFile('/etc/machine-id', 'utf-8');
      return content.trim();
    } catch {
      return 'unknown-host';
    }
  }
}

/**
 * Create attestation service
 */
export function createAttestationService(keyPath?: string, passphrase?: string): SandboxAttestationService {
  return new SandboxAttestationService(
    keyPath || process.env.ATTESTATION_KEY_PATH || '/etc/crashlab/attestation/key.pem',
    passphrase || process.env.ATTESTATION_KEY_PASSPHRASE
  );
}