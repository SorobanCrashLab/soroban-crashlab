/**
 * Verification Policy
 * 
 * Defines verification policies for different artifact types.
 * Controls signature requirements, verification methods, and actions.
 */

export type ArtifactType = 'crash-bundle' | 'reproducer-script' | 'corpus-file' | 'wasm-module' | 'seed-file' | 'trace-log' | 'coverage-report';

export type VerificationMethod = 'none' | 'cosign' | 'sigstore' | 'ed25519' | 'custom';

export type VerificationAction = 'allow' | 'quarantine' | 'reject';

export interface VerificationRule {
  artifactType: ArtifactType;
  requiredMethods: VerificationMethod[];
  minSignatures: number;
  trustedSigners: string[]; // Key IDs or certificate subjects
  allowUnsigned: boolean;
  actionOnFailure: VerificationAction;
  maxAgeDays?: number; // Maximum age of signature
}

export interface VerificationPolicy {
  version: string;
  name: string;
  description: string;
  rules: VerificationRule[];
  defaultRule: VerificationRule;
  updatedAt: string;
}

export const DEFAULT_VERIFICATION_POLICY: VerificationPolicy = {
  version: '1.0.0',
  name: 'Default Artifact Verification Policy',
  description: 'Standard verification requirements for CrashLab artifacts',
  rules: [
    {
      artifactType: 'crash-bundle',
      requiredMethods: ['ed25519'],
      minSignatures: 1,
      trustedSigners: ['crashlab-core@soroban-crashlab'],
      allowUnsigned: false,
      actionOnFailure: 'reject',
      maxAgeDays: 365,
    },
    {
      artifactType: 'reproducer-script',
      requiredMethods: ['cosign', 'sigstore'],
      minSignatures: 1,
      trustedSigners: [],
      allowUnsigned: false,
      actionOnFailure: 'quarantine',
      maxAgeDays: 90,
    },
    {
      artifactType: 'corpus-file',
      requiredMethods: ['cosign', 'sigstore'],
      minSignatures: 1,
      trustedSigners: [],
      allowUnsigned: true,
      actionOnFailure: 'quarantine',
      maxAgeDays: 180,
    },
    {
      artifactType: 'wasm-module',
      requiredMethods: ['cosign', 'sigstore', 'ed25519'],
      minSignatures: 1,
      trustedSigners: [],
      allowUnsigned: false,
      actionOnFailure: 'reject',
      maxAgeDays: 365,
    },
    {
      artifactType: 'seed-file',
      requiredMethods: ['none'],
      minSignatures: 0,
      trustedSigners: [],
      allowUnsigned: true,
      actionOnFailure: 'allow',
    },
    {
      artifactType: 'trace-log',
      requiredMethods: ['none'],
      minSignatures: 0,
      trustedSigners: [],
      allowUnsigned: true,
      actionOnFailure: 'allow',
    },
    {
      artifactType: 'coverage-report',
      requiredMethods: ['none'],
      minSignatures: 0,
      trustedSigners: [],
      allowUnsigned: true,
      actionOnFailure: 'allow',
    },
  ],
  defaultRule: {
    artifactType: 'seed-file',
    requiredMethods: ['none'],
    minSignatures: 0,
    trustedSigners: [],
    allowUnsigned: true,
    actionOnFailure: 'allow',
  },
  updatedAt: new Date().toISOString(),
};

export interface VerificationResult {
  artifactId: string;
  artifactType: ArtifactType;
  verified: boolean;
  method: VerificationMethod;
  signatures: SignatureVerification[];
  policy: VerificationRule;
  action: VerificationAction;
  reason: string;
  timestamp: string;
}

export interface SignatureVerification {
  method: VerificationMethod;
  keyId: string;
  signer: string;
  verified: boolean;
  error?: string;
  signedAt?: string;
  expiresAt?: string;
  certificate?: string;
}

export interface SigningKey {
  id: string;
  type: 'ed25519' | 'ecdsa-p256' | 'rsa-2048' | 'rsa-4096';
  publicKey: string; // PEM or raw
  privateKey?: string; // PEM (for signing)
  algorithm: string;
  createdAt: string;
  expiresAt?: string;
  metadata: Record<string, string>;
}

export interface SigningCertificate {
  pem: string;
  subject: string;
  issuer: string;
  notBefore: string;
  notAfter: string;
  fingerprint: string;
  extensions: Record<string, string>;
}

/**
 * Get verification rule for artifact type
 */
export function getVerificationRule(
  policy: VerificationPolicy,
  artifactType: ArtifactType
): VerificationRule {
  return policy.rules.find(r => r.artifactType === artifactType) || policy.defaultRule;
}

/**
 * Determine action based on verification results
 */
export function determineVerificationAction(
  results: SignatureVerification[],
  rule: VerificationRule
): { action: VerificationAction; reason: string } {
  // Check if any required method succeeded
  const successfulMethods = results.filter(r => r.verified).map(r => r.method);
  const requiredMethodsMet = rule.requiredMethods.every(m => successfulMethods.includes(m));
  
  const validSignatures = results.filter(r => r.verified).length;
  
  if (rule.requiredMethods.includes('none')) {
    return { action: 'allow', reason: 'No verification required' };
  }

  if (validSignatures === 0) {
    if (rule.allowUnsigned) {
      return { action: 'allow', reason: 'Unsigned artifact allowed by policy' };
    }
    return { action: rule.actionOnFailure, reason: 'No valid signatures found' };
  }

  if (validSignatures < rule.minSignatures) {
    return { action: rule.actionOnFailure, reason: `Insufficient signatures: ${validSignatures}/${rule.minSignatures}` };
  }

  if (!requiredMethodsMet) {
    const missing = rule.requiredMethods.filter(m => !successfulMethods.includes(m));
    return { action: rule.actionOnFailure, reason: `Missing required verification methods: ${missing.join(', ')}` };
  }

  // Check trusted signers
  if (rule.trustedSigners.length > 0) {
    const trustedCount = results.filter(r => 
      r.verified && rule.trustedSigners.some(t => r.signer.includes(t) || r.keyId.includes(t))
    ).length;
    
    if (trustedCount === 0) {
      return { action: rule.actionOnFailure, reason: 'No signatures from trusted signers' };
    }
  }

  // Check signature age
  if (rule.maxAgeDays) {
    const maxAge = rule.maxAgeDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const expired = results.filter(r => 
      r.verified && r.signedAt && (now - new Date(r.signedAt).getTime()) > maxAge
    );
    
    if (expired.length === validSignatures) {
      return { action: rule.actionOnFailure, reason: 'All signatures expired' };
    }
  }

  return { action: 'allow', reason: 'All verification requirements met' };
}

/**
 * Create a custom verification policy
 */
export function createVerificationPolicy(
  name: string,
  description: string,
  rules: Partial<VerificationRule>[],
  defaultRule: Partial<VerificationRule>
): VerificationPolicy {
  const fullRules: VerificationRule[] = rules.map(r => ({
    artifactType: r.artifactType || 'seed-file',
    requiredMethods: r.requiredMethods || ['none'],
    minSignatures: r.minSignatures ?? 0,
    trustedSigners: r.trustedSigners || [],
    allowUnsigned: r.allowUnsigned ?? true,
    actionOnFailure: r.actionOnFailure || 'allow',
    maxAgeDays: r.maxAgeDays,
  }));

  return {
    version: '1.0.0',
    name,
    description,
    rules: fullRules,
    defaultRule: {
      artifactType: defaultRule.artifactType || 'seed-file',
      requiredMethods: defaultRule.requiredMethods || ['none'],
      minSignatures: defaultRule.minSignatures ?? 0,
      trustedSigners: defaultRule.trustedSigners || [],
      allowUnsigned: defaultRule.allowUnsigned ?? true,
      actionOnFailure: defaultRule.actionOnFailure || 'allow',
      maxAgeDays: defaultRule.maxAgeDays,
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Strict policy for production environments
 */
export const STRICT_VERIFICATION_POLICY: VerificationPolicy = {
  version: '1.0.0',
  name: 'Strict Production Policy',
  description: 'Strict verification for production artifact handling',
  rules: [
    {
      artifactType: 'crash-bundle',
      requiredMethods: ['ed25519'],
      minSignatures: 2,
      trustedSigners: ['crashlab-core@soroban-crashlab', 'release-engineering@soroban-crashlab'],
      allowUnsigned: false,
      actionOnFailure: 'reject',
      maxAgeDays: 180,
    },
    {
      artifactType: 'reproducer-script',
      requiredMethods: ['cosign', 'sigstore'],
      minSignatures: 1,
      trustedSigners: ['verified-contributors@soroban-crashlab'],
      allowUnsigned: false,
      actionOnFailure: 'reject',
      maxAgeDays: 30,
    },
    {
      artifactType: 'corpus-file',
      requiredMethods: ['cosign', 'sigstore'],
      minSignatures: 1,
      trustedSigners: [],
      allowUnsigned: false,
      actionOnFailure: 'quarantine',
      maxAgeDays: 90,
    },
    {
      artifactType: 'wasm-module',
      requiredMethods: ['cosign', 'sigstore', 'ed25519'],
      minSignatures: 2,
      trustedSigners: ['build-system@soroban-crashlab'],
      allowUnsigned: false,
      actionOnFailure: 'reject',
      maxAgeDays: 180,
    },
    {
      artifactType: 'seed-file',
      requiredMethods: ['cosign'],
      minSignatures: 1,
      trustedSigners: [],
      allowUnsigned: false,
      actionOnFailure: 'quarantine',
      maxAgeDays: 365,
    },
    {
      artifactType: 'trace-log',
      requiredMethods: ['none'],
      minSignatures: 0,
      trustedSigners: [],
      allowUnsigned: true,
      actionOnFailure: 'allow',
    },
    {
      artifactType: 'coverage-report',
      requiredMethods: ['none'],
      minSignatures: 0,
      trustedSigners: [],
      allowUnsigned: true,
      actionOnFailure: 'allow',
    },
  ],
  defaultRule: {
    artifactType: 'seed-file',
    requiredMethods: ['cosign'],
    minSignatures: 1,
    trustedSigners: [],
    allowUnsigned: false,
    actionOnFailure: 'quarantine',
  },
  updatedAt: new Date().toISOString(),
};