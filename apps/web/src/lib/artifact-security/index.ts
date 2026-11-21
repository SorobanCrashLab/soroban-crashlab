/**
 * Artifact Security Module
 * 
 * Multi-layer artifact security with defense in depth:
 * - Malware scanning (ClamAV + YARA)
 * - Signature verification (Sigstore/cosign + Ed25519)
 * - Sandboxed reproduction (gVisor/Kata)
 * - Supply chain integrity (SLSA, SBOM, vulnerability scanning)
 * - Quarantine management with review workflow
 */

export * from './scanning/index.js';
export * from './verification/index.js';
export * from './sandbox/index.js';
export * from './supplychain/index.js';
export * from './quarantine/index.js';
export * from './hooks/index.js';

// Re-export key types for convenience
export type {
  ScanResult,
  ScanVerdict,
  QuarantineDecision,
  ScannerConfig,
} from './scanning/ScanResult.js';

export type {
  VerificationPolicy,
  VerificationRule,
  VerificationResult,
  SignatureVerification,
  ArtifactType,
  VerificationMethod,
  VerificationAction,
} from './verification/VerificationPolicy.js';

export type {
  SandboxProfileConfig,
  SandboxRuntime,
  ResourceLimits,
  SeccompProfile,
  CapabilityConfig,
} from './sandbox/SandboxProfile.js';

export type {
  SLSAAttestation,
  SLSAProvenance,
  BuildInfo,
  VerificationResult as SLSAVerificationResult,
} from './supplychain/SLSAAttestation.js';

export type {
  QuarantineEntry,
  QuarantineStatus,
  QuarantineReason,
  QuarantineFilter,
  QuarantineStats,
} from './quarantine/QuarantineManager.js';

export type {
  ReproductionRequest,
  ReproductionResult,
  ArtifactInput,
} from './sandbox/ReproductionExecutor.js';