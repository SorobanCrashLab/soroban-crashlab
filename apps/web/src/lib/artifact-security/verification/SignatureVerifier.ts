/**
 * Signature Verifier
 * 
 * Verifies artifact signatures using Sigstore/cosign and Ed25519.
 * Supports keyless signing, certificate verification, and policy enforcement.
 */

import { spawn, SpawnOptions } from 'node:child_process';
import { createVerify, createPublicKey, KeyObject } from 'node:crypto';
import { readFile, writeFile, tmpdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  VerificationMethod,
  VerificationResult,
  SignatureVerification,
  SigningKey,
  SigningCertificate,
  VerificationPolicy,
  VerificationRule,
  getVerificationRule,
  determineVerificationAction,
  DEFAULT_VERIFICATION_POLICY,
} from './VerificationPolicy.js';

export interface CosignVerifyOptions {
  artifactPath: string;
  signaturePath?: string;
  certificatePath?: string;
  certificateChainPath?: string;
  certificateIdentity?: string;
  certificateOidcIssuer?: string;
  rooteCAPath?: string;
  publicKeyPath?: string;
  timeoutMs?: number;
}

export interface Ed25519VerifyOptions {
  artifactPath: string;
  signaturePath: string;
  publicKeyPath: string;
}

export interface SigstoreBundle {
  mediaType: string;
  dsseEnvelope: {
    payload: string;
    payloadType: string;
    signatures: Array<{
      keyid: string;
      sig: string;
      cert?: string;
      chain?: string[];
    }>;
  };
}

export class SignatureVerifier {
  private policy: VerificationPolicy;
  private cosignPath: string;
  private trustedRoots: string[] = [];

  constructor(
    policy: VerificationPolicy = DEFAULT_VERIFICATION_POLICY,
    cosignPath: string = 'cosign'
  ) {
    this.policy = policy;
    this.cosignPath = cosignPath;
  }

  /**
   * Set custom policy
   */
  setPolicy(policy: VerificationPolicy): void {
    this.policy = policy;
  }

  /**
   * Add trusted root CA
   */
  addTrustedRoot(caPem: string): void {
    this.trustedRoots.push(caPem);
  }

  /**
   * Verify artifact with policy enforcement
   */
  async verifyArtifact(
    artifactId: string,
    artifactType: string,
    artifactPath: string,
    signaturePaths: string[] = [],
    certificatePaths: string[] = []
  ): Promise<VerificationResult> {
    const artifactTypeEnum = artifactType as VerificationResult['artifactType'];
    const rule = getVerificationRule(this.policy, artifactTypeEnum);
    const verifications: SignatureVerification[] = [];

    // Try each required verification method
    for (const method of rule.requiredMethods) {
      if (method === 'none') {
        verifications.push({
          method: 'none',
          keyId: 'none',
          signer: 'none',
          verified: true,
        });
        continue;
      }

      switch (method) {
        case 'cosign':
        case 'sigstore':
          const cosignResult = await this.verifyCosign(artifactPath, signaturePaths, certificatePaths);
          verifications.push(...cosignResult);
          break;
        case 'ed25519':
          const ed25519Result = await this.verifyEd25519(artifactPath, signaturePaths);
          verifications.push(...ed25519Result);
          break;
        case 'custom':
          // Custom verification would be implemented here
          break;
      }
    }

    const { action, reason } = determineVerificationAction(verifications, rule);

    return {
      artifactId,
      artifactType: artifactTypeEnum,
      verified: action === 'allow',
      method: rule.requiredMethods[0] || 'none',
      signatures: verifications,
      policy: rule,
      action,
      reason,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Verify using cosign/Sigstore
   */
  async verifyCosign(
    artifactPath: string,
    signaturePaths: string[] = [],
    certificatePaths: string[] = []
  ): Promise<SignatureVerification[]> {
    const results: SignatureVerification[] = [];

    // If signature paths provided, verify each
    if (signaturePaths.length > 0) {
      for (const sigPath of signaturePaths) {
        const result = await this.verifyCosignSignature(artifactPath, sigPath, certificatePaths);
        results.push(result);
      }
    } else {
      // Try to verify with cosign's automatic discovery
      const result = await this.verifyCosignAuto(artifactPath);
      if (result) results.push(result);
    }

    return results;
  }

  /**
   * Verify a specific cosign signature
   */
  private async verifyCosignSignature(
    artifactPath: string,
    signaturePath: string,
    certificatePaths: string[]
  ): Promise<SignatureVerification> {
    const args = [
      'verify-blob',
      '--signature', signaturePath,
    ];

    // Add certificates if provided
    for (const certPath of certificatePaths) {
      args.push('--certificate', certPath);
    }

    // Add trusted roots
    for (const root of this.trustedRoots) {
      const tempRoot = join(tmpdir(), `cosign-root-${Date.now()}.pem`);
      await writeFile(tempRoot, root);
      args.push('--certificate-chain', tempRoot);
    }

    args.push(artifactPath);

    return new Promise((resolve) => {
      const child = spawn(this.cosignPath, args, { stdio: 'pipe', timeout: 60000 } as SpawnOptions);
      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => { stdout += data.toString(); });
      child.stderr?.on('data', (data) => { stderr += data.toString(); });

      child.on('close', (code) => {
        if (code === 0) {
          // Parse output for key info
          const keyIdMatch = stdout.match(/keyid:\s*(\S+)/i);
          const certMatch = stdout.match(/certificate:\s*(\S+)/i);
          
          resolve({
            method: 'cosign',
            keyId: keyIdMatch?.[1] || 'unknown',
            signer: certMatch?.[1] || 'unknown',
            verified: true,
            signedAt: new Date().toISOString(),
          });
        } else {
          resolve({
            method: 'cosign',
            keyId: 'unknown',
            signer: 'unknown',
            verified: false,
            error: stderr || `cosign exited with code ${code}`,
          });
        }
      });

      child.on('error', (error) => {
        resolve({
          method: 'cosign',
          keyId: 'unknown',
          signer: 'unknown',
          verified: false,
          error: error.message,
        });
      });
    });
  }

  /**
   * Verify with cosign auto-discovery (keyless)
   */
  private async verifyCosignAuto(artifactPath: string): Promise<SignatureVerification | null> {
    const args = ['verify-blob', artifactPath];

    return new Promise((resolve) => {
      const child = spawn(this.cosignPath, args, { stdio: 'pipe', timeout: 60000 } as SpawnOptions);
      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => { stdout += data.toString(); });
      child.stderr?.on('data', (data) => { stderr += data.toString(); });

      child.on('close', (code) => {
        if (code === 0) {
          const keyIdMatch = stdout.match(/keyid:\s*(\S+)/i);
          const certMatch = stdout.match(/certificate:\s*(\S+)/i);
          const issuerMatch = stdout.match(/issuer:\s*(\S+)/i);
          
          resolve({
            method: 'cosign',
            keyId: keyIdMatch?.[1] || 'keyless',
            signer: certMatch?.[1] || issuerMatch?.[1] || 'keyless',
            verified: true,
            signedAt: new Date().toISOString(),
            certificate: certMatch?.[1],
          });
        } else {
          resolve(null);
        }
      });

      child.on('error', () => resolve(null));
    });
  }

  /**
   * Verify Ed25519 signature
   */
  async verifyEd25519(
    artifactPath: string,
    signaturePaths: string[]
  ): Promise<SignatureVerification[]> {
    const results: SignatureVerification[] = [];

    for (const sigPath of signaturePaths) {
      try {
        const [artifact, signature, publicKey] = await Promise.all([
          readFile(artifactPath),
          readFile(sigPath),
          readFile(sigPath.replace(/\.sig$/, '.pub').replace(/\.signature$/, '.pub')),
        ]);

        const key = createPublicKey({ key: publicKey, format: 'pem', type: 'spki' });
        const verify = createVerify('sha256');
        verify.update(artifact);
        verify.end();

        const verified = verify.verify(key, signature);

        results.push({
          method: 'ed25519',
          keyId: this.getKeyId(publicKey),
          signer: 'ed25519-signer',
          verified,
          error: verified ? undefined : 'Ed25519 signature verification failed',
          signedAt: new Date().toISOString(),
        });
      } catch (error) {
        results.push({
          method: 'ed25519',
          keyId: 'unknown',
          signer: 'unknown',
          verified: false,
          error: error instanceof Error ? error.message : 'Ed25519 verification error',
        });
      }
    }

    return results;
  }

  /**
   * Extract key ID from public key
   */
  private getKeyId(publicKey: Buffer): string {
    try {
      const key = createPublicKey({ key: publicKey, format: 'pem', type: 'spki' });
      const der = key.export({ format: 'der', type: 'spki' });
      const crypto = require('node:crypto');
      const hash = crypto.createHash('sha256').update(der).digest('hex');
      return `ed25519:${hash.substring(0, 16)}`;
    } catch {
      return 'ed25519:unknown';
    }
  }

  /**
   * Verify Sigstore bundle
   */
  async verifySigstoreBundle(
    artifactPath: string,
    bundlePath: string
  ): Promise<SignatureVerification[]> {
    const results: SignatureVerification[] = [];

    try {
      const bundleContent = await readFile(bundlePath, 'utf-8');
      const bundle: SigstoreBundle = JSON.parse(bundleContent);

      // Verify each signature in the bundle
      for (const sig of bundle.dsseEnvelope.signatures) {
        // This would use sigstore verification library
        // For now, return a placeholder result
        results.push({
          method: 'sigstore',
          keyId: sig.keyid,
          signer: sig.cert ? 'certificate' : 'unknown',
          verified: false, // Would need full sigstore verification
          error: 'Full sigstore bundle verification not yet implemented',
          certificate: sig.cert,
        });
      }
    } catch (error) {
      results.push({
        method: 'sigstore',
        keyId: 'unknown',
        signer: 'unknown',
        verified: false,
        error: error instanceof Error ? error.message : 'Bundle parsing error',
      });
    }

    return results;
  }

  /**
   * Check if cosign is available
   */
  async checkCosignAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn(this.cosignPath, ['version'], { stdio: 'pipe' });
      child.on('close', (code) => resolve(code === 0));
      child.on('error', () => resolve(false));
    });
  }

  /**
   * Get cosign version
   */
  async getCosignVersion(): Promise<string | null> {
    return new Promise((resolve) => {
      const child = spawn(this.cosignPath, ['version'], { stdio: 'pipe' });
      let stdout = '';
      child.stdout?.on('data', (data) => { stdout += data.toString(); });
      child.on('close', (code) => resolve(code === 0 ? stdout.trim() : null));
      child.on('error', () => resolve(null));
    });
  }
}

/**
 * Create a signature verifier with default settings
 */
export function createSignatureVerifier(
  policy?: VerificationPolicy,
  cosignPath?: string
): SignatureVerifier {
  return new SignatureVerifier(
    policy || DEFAULT_VERIFICATION_POLICY,
    cosignPath || process.env.COSIGN_PATH || 'cosign'
  );
}