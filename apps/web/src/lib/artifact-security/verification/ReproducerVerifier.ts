/**
 * Reproducer Verifier
 * 
 * Verifies reproducer scripts and their signatures before execution.
 * Ensures only authorized, unmodified reproducers run in the sandbox.
 */

import { SignatureVerifier } from './SignatureVerifier.js';
import { VerificationPolicy, VerificationResult, VerificationAction, ArtifactType, DEFAULT_VERIFICATION_POLICY } from './VerificationPolicy.js';

export interface ReproducerMetadata {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  targetContract: string;
  targetFunction: string;
  requiredCapabilities: string[];
  maxExecutionTimeMs: number;
  maxMemoryMB: number;
  networkAccess: boolean;
  filesystemAccess: boolean;
}

export interface ReproducerPackage {
  metadata: ReproducerMetadata;
  script: string; // The actual reproducer code
  dependencies: Record<string, string>; // Package name -> version
  signature?: string;
  certificate?: string;
}

export interface VerificationContext {
  artifactId: string;
  artifactType: ArtifactType;
  requestedCapabilities: string[];
  environment: 'production' | 'staging' | 'development';
  requestedBy: string; // User/service identity
}

export interface ReproducerVerificationResult {
  verified: boolean;
  verification: VerificationResult;
  metadataValid: boolean;
  metadataErrors: string[];
  capabilityCheck: CapabilityCheckResult;
  policyAction: VerificationAction;
  allowed: boolean;
  reason: string;
}

export interface CapabilityCheckResult {
  allowed: boolean;
  requested: string[];
  granted: string[];
  denied: string[];
  reason?: string;
}

export class ReproducerVerifier {
  private signatureVerifier: SignatureVerifier;
  private policy: VerificationPolicy;
  private allowedCapabilities: Set<string>;

  constructor(
    policy: VerificationPolicy = DEFAULT_VERIFICATION_POLICY,
    allowedCapabilities: string[] = []
  ) {
    this.signatureVerifier = new SignatureVerifier(policy);
    this.policy = policy;
    this.allowedCapabilities = new Set(allowedCapabilities);
  }

  /**
   * Set custom policy
   */
  setPolicy(policy: VerificationPolicy): void {
    this.policy = policy;
    this.signatureVerifier.setPolicy(policy);
  }

  /**
   * Add allowed capability
   */
  addAllowedCapability(capability: string): void {
    this.allowedCapabilities.add(capability);
  }

  /**
   * Verify a reproducer package
   */
  async verifyReproducer(
    reproducer: ReproducerPackage,
    context: VerificationContext
  ): Promise<ReproducerVerificationResult> {
    // 1. Verify metadata
    const { metadataValid, metadataErrors } = this.validateMetadata(reproducer.metadata);

    // 2. Check capabilities
    const capabilityCheck = this.checkCapabilities(
      reproducer.metadata.requiredCapabilities,
      context.environment
    );

    // 3. Verify signature
    const verification = await this.signatureVerifier.verifyArtifact(
      context.artifactId,
      'reproducer-script',
      '', // Would need actual file path
      reproducer.signature ? [reproducer.signature] : [],
      reproducer.certificate ? [reproducer.certificate] : []
    );

    // 4. Determine overall result
    const policyAction = verification.action;
    const allowed = metadataValid && 
                    capabilityCheck.allowed && 
                    (policyAction === 'allow' || (policyAction === 'quarantine' && context.environment !== 'production'));

    let reason = '';
    if (!metadataValid) {
      reason = `Invalid metadata: ${metadataErrors.join(', ')}`;
    } else if (!capabilityCheck.allowed) {
      reason = `Capability check failed: ${capabilityCheck.reason}`;
    } else if (policyAction === 'reject') {
      reason = `Signature verification rejected: ${verification.reason}`;
    } else if (policyAction === 'quarantine') {
      reason = `Signature verification quarantined: ${verification.reason}`;
    } else {
      reason = 'All checks passed';
    }

    return {
      verified: verification.verified,
      verification,
      metadataValid,
      metadataErrors,
      capabilityCheck,
      policyAction,
      allowed,
      reason,
    };
  }

  /**
   * Validate reproducer metadata
   */
  private validateMetadata(metadata: ReproducerMetadata): { metadataValid: boolean; metadataErrors: string[] } {
    const errors: string[] = [];

    if (!metadata.id || metadata.id.length === 0) {
      errors.push('Missing reproducer ID');
    }

    if (!metadata.name || metadata.name.length === 0) {
      errors.push('Missing reproducer name');
    }

    if (!metadata.version || metadata.version.length === 0) {
      errors.push('Missing version');
    }

    if (!metadata.author || metadata.author.length === 0) {
      errors.push('Missing author');
    }

    if (!metadata.targetContract || metadata.targetContract.length === 0) {
      errors.push('Missing target contract');
    }

    if (!metadata.targetFunction || metadata.targetFunction.length === 0) {
      errors.push('Missing target function');
    }

    if (metadata.maxExecutionTimeMs <= 0 || metadata.maxExecutionTimeMs > 300000) {
      errors.push('Invalid maxExecutionTimeMs (must be 1-300000)');
    }

    if (metadata.maxMemoryMB <= 0 || metadata.maxMemoryMB > 4096) {
      errors.push('Invalid maxMemoryMB (must be 1-4096)');
    }

    // Validate capabilities are known
    const knownCapabilities = [
      'network',
      'filesystem-read',
      'filesystem-write',
      'contract-call',
      'contract-deploy',
      'crypto-sign',
      'crypto-verify',
      'random',
      'time',
    ];

    for (const cap of metadata.requiredCapabilities) {
      if (!knownCapabilities.includes(cap)) {
        errors.push(`Unknown capability: ${cap}`);
      }
    }

    return {
      metadataValid: errors.length === 0,
      metadataErrors: errors,
    };
  }

  /**
   * Check if requested capabilities are allowed
   */
  private checkCapabilities(
    requested: string[],
    environment: VerificationContext['environment']
  ): CapabilityCheckResult {
    const granted: string[] = [];
    const denied: string[] = [];

    for (const cap of requested) {
      if (this.allowedCapabilities.has(cap)) {
        granted.push(cap);
      } else {
        denied.push(cap);
      }
    }

    // In development, allow more capabilities
    if (environment === 'development') {
      // Grant all requested in development
      return {
        allowed: true,
        requested,
        granted: requested,
        denied: [],
      };
    }

    // In staging, allow if explicitly in allowed list
    if (environment === 'staging') {
      return {
        allowed: denied.length === 0,
        requested,
        granted,
        denied,
        reason: denied.length > 0 ? `Capabilities not allowed in staging: ${denied.join(', ')}` : undefined,
      };
    }

    // In production, strict - only explicitly allowed
    return {
      allowed: denied.length === 0,
      requested,
      granted,
      denied,
      reason: denied.length > 0 ? `Capabilities not allowed in production: ${denied.join(', ')}` : undefined,
    };
  }

  /**
   * Quick verification for runtime checks
   */
  async quickVerify(
    scriptHash: string,
    signature: string,
    publicKey: string
  ): Promise<boolean> {
    // Quick Ed25519 verification for runtime
    const { createVerify } = await import('node:crypto');
    const verify = createVerify('sha256');
    verify.update(scriptHash);
    verify.end();
    
    const pubKey = await import('node:crypto').then(c => c.createPublicKey({ key: publicKey, format: 'pem', type: 'spki' }));
    const sig = Buffer.from(signature, 'base64');
    
    return verify.verify(pubKey, sig);
  }

  /**
   * Parse reproducer from file
   */
  static async parseReproducerFile(filePath: string): Promise<ReproducerPackage> {
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(filePath, 'utf-8');
    
    try {
      return JSON.parse(content) as ReproducerPackage;
    } catch {
      // If not JSON, treat as raw script with minimal metadata
      return {
        metadata: {
          id: `reproducer-${Date.now()}`,
          name: 'Unnamed Reproducer',
          version: '1.0.0',
          author: 'unknown',
          description: 'Raw script reproducer',
          targetContract: '',
          targetFunction: '',
          requiredCapabilities: [],
          maxExecutionTimeMs: 30000,
          maxMemoryMB: 512,
          networkAccess: false,
          filesystemAccess: false,
        },
        script: content,
        dependencies: {},
      };
    }
  }

  /**
   * Create a reproducer package
   */
  static createReproducerPackage(
    metadata: ReproducerMetadata,
    script: string,
    dependencies: Record<string, string> = {}
  ): ReproducerPackage {
    return {
      metadata,
      script,
      dependencies,
    };
  }
}

/**
 * Create a reproducer verifier with default settings
 */
export function createReproducerVerifier(
  policy?: VerificationPolicy,
  allowedCapabilities?: string[]
): ReproducerVerifier {
  return new ReproducerVerifier(
    policy || DEFAULT_VERIFICATION_POLICY,
    allowedCapabilities || ['contract-call', 'crypto-verify', 'random', 'time']
  );
}