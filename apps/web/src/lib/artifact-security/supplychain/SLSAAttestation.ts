/**
 * SLSA Attestation
 * 
 * Generates and verifies SLSA (Supply-chain Levels for Software Artifacts) attestations.
 * Implements SLSA Level 3 requirements: provenance, reproducibility, signing, verification.
 */

import { createHash } from 'node:crypto';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { v4 as uuidv4 } from 'uuid';

export type SLSALevel = 1 | 2 | 3;

export interface SLSAProvenance {
  _type: 'https://in-toto.io/Statement/v0.1';
  subject: SLSAArtifact[];
  predicateType: 'https://slsa.dev/provenance/v1';
  predicate: SLSAProvenancePredicate;
}

export interface SLSAArtifact {
  name: string;
  digest: Record<string, string>; // algorithm -> hex digest
}

export interface SLSAProvenancePredicate {
  buildDefinition: SLSABuildDefinition;
  runDetails: SLSARunDetails;
}

export interface SLSABuildDefinition {
  buildType: string;
  externalParameters: Record<string, any>;
  internalParameters: Record<string, any>;
  resolvedDependencies: SLSAArtifact[];
  environment?: Record<string, string>;
}

export interface SLSARunDetails {
  builder: SLSABuilder;
  metadata: SLSAMetadata;
  byproducts?: SLSAArtifact[];
}

export interface SLSABuilder {
  id: string;
  version?: string;
  builderDependencies?: SLSAArtifact[];
}

export interface SLSAMetadata {
  invocationId: string;
  startedOn: string;
  finishedOn: string;
  completeness?: SLSAMetadataCompleteness;
  reproducible?: boolean;
}

export interface SLSAMetadataCompleteness {
  parameters: boolean;
  environment: boolean;
  materials: boolean;
}

export interface SLSAAttestation {
  provenance: SLSAProvenance;
  signature: string;
  publicKey: string;
  keyId: string;
}

export interface BuildInfo {
  buildType: string;
  buildId: string;
  buildUrl: string;
  sourceRepo: string;
  sourceCommit: string;
  sourceBranch: string;
  sourceTag?: string;
  builderId: string;
  builderVersion: string;
  buildStartedAt: string;
  buildFinishedAt: string;
  buildCommand: string[];
  buildEnvironment: Record<string, string>;
  dependencies: Dependency[];
  artifacts: BuildArtifact[];
  isReproducible: boolean;
}

export interface Dependency {
  name: string;
  version: string;
  digest: Record<string, string>;
  sourceRepo?: string;
  sourceCommit?: string;
}

export interface BuildArtifact {
  name: string;
  path: string;
  digest: Record<string, string>;
  type: 'binary' | 'library' | 'package' | 'container' | 'wasm' | 'other';
}

export class SLSAAttestationService {
  private privateKeyPem: string;
  private publicKeyPem: string;
  private keyId: string;

  constructor(privateKeyPem: string, publicKeyPem: string) {
    this.privateKeyPem = privateKeyPem;
    this.publicKeyPem = publicKeyPem;
    
    const crypto = require('node:crypto');
    const der = crypto.createPublicKey({ key: publicKeyPem, format: 'pem', type: 'spki' })
      .export({ format: 'der', type: 'spki' });
    const hash = crypto.createHash('sha256').update(der).digest('hex');
    this.keyId = `slsa:${hash.substring(0, 16)}`;
  }

  /**
   * Create SLSA attestation from build info
   */
  async createAttestation(buildInfo: BuildInfo): Promise<SLSAAttestation> {
    const provenance = this.buildProvenance(buildInfo);
    const signature = this.signProvenance(provenance);

    return {
      provenance,
      signature,
      publicKey: this.publicKeyPem,
      keyId: this.keyId,
    };
  }

  /**
   * Build SLSA provenance from build info
   */
  private buildProvenance(buildInfo: BuildInfo): SLSAProvenance {
    const subject: SLSAArtifact[] = buildInfo.artifacts.map(artifact => ({
      name: artifact.name,
      digest: artifact.digest,
    }));

    const buildDefinition: SLSABuildDefinition = {
      buildType: buildInfo.buildType,
      externalParameters: {
        sourceRepo: buildInfo.sourceRepo,
        sourceCommit: buildInfo.sourceCommit,
        sourceBranch: buildInfo.sourceBranch,
        sourceTag: buildInfo.sourceTag,
        buildCommand: buildInfo.buildCommand,
      },
      internalParameters: {
        buildId: buildInfo.buildId,
        buildUrl: buildInfo.buildUrl,
        builderId: buildInfo.builderId,
        builderVersion: buildInfo.builderVersion,
      },
      resolvedDependencies: buildInfo.dependencies.map(dep => ({
        name: dep.name,
        digest: dep.digest,
      })),
      environment: buildInfo.buildEnvironment,
    };

    const runDetails: SLSARunDetails = {
      builder: {
        id: buildInfo.builderId,
        version: buildInfo.builderVersion,
        builderDependencies: buildInfo.dependencies.map(dep => ({
          name: dep.name,
          digest: dep.digest,
        })),
      },
      metadata: {
        invocationId: buildInfo.buildId,
        startedOn: buildInfo.buildStartedAt,
        finishedOn: buildInfo.buildFinishedAt,
        completeness: {
          parameters: true,
          environment: true,
          materials: true,
        },
        reproducible: buildInfo.isReproducible,
      },
      byproducts: [],
    };

    return {
      _type: 'https://in-toto.io/Statement/v0.1',
      subject,
      predicateType: 'https://slsa.dev/provenance/v1',
      predicate: {
        buildDefinition,
        runDetails,
      },
    };
  }

  /**
   * Sign provenance
   */
  private signProvenance(provenance: SLSAProvenance): string {
    const { createSign } = require('node:crypto');
    const payload = JSON.stringify(provenance, Object.keys(provenance).sort());
    const sign = createSign('sha256');
    sign.update(payload);
    sign.end();
    return sign.sign(this.privateKeyPem).toString('base64');
  }

  /**
   * Verify SLSA attestation
   */
  async verifyAttestation(attestation: SLSAAttestation, trustedKeys?: string[]): Promise<VerificationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check key trust
    if (trustedKeys && trustedKeys.length > 0) {
      if (!trustedKeys.includes(attestation.keyId)) {
        errors.push(`Untrusted key ID: ${attestation.keyId}`);
      }
    }

    // Verify signature
    try {
      const { createVerify } = require('node:crypto');
      const payload = JSON.stringify(attestation.provenance, Object.keys(attestation.provenance).sort());
      const verify = createVerify('sha256');
      verify.update(payload);
      verify.end();
      
      const signature = Buffer.from(attestation.signature, 'base64');
      const publicKey = require('node:crypto').createPublicKey({ key: attestation.publicKey, format: 'pem', type: 'spki' });
      const valid = verify.verify(publicKey, signature);
      
      if (!valid) {
        errors.push('Invalid signature');
      }
    } catch (error) {
      errors.push(`Signature verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Verify provenance structure
    const provErrors = this.validateProvenance(attestation.provenance);
    errors.push(...provErrors);

    // Check SLSA level requirements
    const levelWarnings = this.checkSLSALevel(attestation.provenance);
    warnings.push(...levelWarnings);

    return {
      valid: errors.length === 0,
      attestation: errors.length === 0 ? attestation : null,
      errors,
      warnings,
      slsaLevel: this.determineSLSALevel(attestation.provenance),
    };
  }

  /**
   * Validate provenance structure
   */
  private validateProvenance(provenance: SLSAProvenance): string[] {
    const errors: string[] = [];

    if (provenance._type !== 'https://in-toto.io/Statement/v0.1') {
      errors.push('Invalid _type');
    }

    if (provenance.predicateType !== 'https://slsa.dev/provenance/v1') {
      errors.push('Invalid predicateType');
    }

    if (!provenance.subject || provenance.subject.length === 0) {
      errors.push('Missing subject artifacts');
    }

    if (!provenance.predicate?.buildDefinition?.buildType) {
      errors.push('Missing buildType');
    }

    if (!provenance.predicate?.runDetails?.builder?.id) {
      errors.push('Missing builder ID');
    }

    if (!provenance.predicate?.runDetails?.metadata?.invocationId) {
      errors.push('Missing invocation ID');
    }

    return errors;
  }

  /**
   * Check SLSA level requirements
   */
  private checkSLSALevel(provenance: SLSAProvenance): string[] {
    const warnings: string[] = [];

    const metadata = provenance.predicate?.runDetails?.metadata;
    const buildDef = provenance.predicate?.buildDefinition;

    // Level 1: Provenance exists
    // Level 2: Provenance + tamper-resistant build service
    // Level 3: Level 2 + hardened build service + reproducible

    if (!metadata?.completeness?.parameters) {
      warnings.push('SLSA Level 2+: parameters not complete');
    }
    if (!metadata?.completeness?.environment) {
      warnings.push('SLSA Level 2+: environment not complete');
    }
    if (!metadata?.completeness?.materials) {
      warnings.push('SLSA Level 2+: materials not complete');
    }
    if (!metadata?.reproducible) {
      warnings.push('SLSA Level 3: build not reproducible');
    }
    if (!buildDef?.resolvedDependencies || buildDef.resolvedDependencies.length === 0) {
      warnings.push('SLSA Level 2+: no resolved dependencies');
    }

    return warnings;
  }

  /**
   * Determine achieved SLSA level
   */
  private determineSLSALevel(provenance: SLSAProvenance): SLSALevel {
    const metadata = provenance.predicate?.runDetails?.metadata;
    const buildDef = provenance.predicate?.buildDefinition;

    let level: SLSALevel = 1;

    // Level 2 requirements
    if (metadata?.completeness?.parameters && 
        metadata?.completeness?.environment && 
        metadata?.completeness?.materials &&
        buildDef?.resolvedDependencies && 
        buildDef.resolvedDependencies.length > 0) {
      level = 2;
    }

    // Level 3 requirements
    if (level === 2 && metadata?.reproducible === true) {
      level = 3;
    }

    return level;
  }

  /**
   * Save attestation to file
   */
  async saveAttestation(attestation: SLSAAttestation, outputPath: string): Promise<void> {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(attestation, null, 2));
  }

  /**
   * Load attestation from file
   */
  async loadAttestation(filePath: string): Promise<SLSAAttestation> {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Generate key pair for SLSA signing
   */
  static generateKeyPair(): { privateKey: string; publicKey: string; keyId: string } {
    const { generateKeyPairSync } = require('node:crypto');
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    
    const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' }).toString();
    
    const der = publicKey.export({ format: 'der', type: 'spki' });
    const hash = require('node:crypto').createHash('sha256').update(der).digest('hex');
    const keyId = `slsa:${hash.substring(0, 16)}`;

    return { privateKey: privateKeyPem, publicKey: publicKeyPem, keyId };
  }

  /**
   * Create SLSA service from environment
   */
  static fromEnvironment(): SLSAAttestationService {
    const privateKey = process.env.SLSA_PRIVATE_KEY;
    const publicKey = process.env.SLSA_PUBLIC_KEY;
    
    if (!privateKey || !publicKey) {
      throw new Error('SLSA_PRIVATE_KEY and SLSA_PUBLIC_KEY environment variables required');
    }

    return new SLSAAttestationService(privateKey, publicKey);
  }
}

export interface VerificationResult {
  valid: boolean;
  attestation: SLSAAttestation | null;
  errors: string[];
  warnings: string[];
  slsaLevel: SLSALevel;
}

/**
 * SLSA Verifier - verifies attestations using slsa-verifier
 */
export class SLSAVerifier {
  private slsaVerifierPath: string;

  constructor(slsaVerifierPath: string = 'slsa-verifier') {
    this.slsaVerifierPath = slsaVerifierPath;
  }

  /**
   * Verify artifact against SLSA provenance
   */
  async verifyArtifact(
    artifactPath: string,
    provenancePath: string,
    sourceUri: string,
    expectedBuilderId?: string
  ): Promise<VerificationResult> {
    const args = [
      'verify-artifact',
      artifactPath,
      '--provenance-path', provenancePath,
      '--source-uri', sourceUri,
    ];

    if (expectedBuilderId) {
      args.push('--builder-id', expectedBuilderId);
    }

    return new Promise((resolve) => {
      const { spawn } = require('node:child_process');
      const child = spawn(this.slsaVerifierPath, args, { stdio: 'pipe' });
      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => { stdout += data.toString(); });
      child.stderr?.on('data', (data) => { stderr += data.toString(); });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({
            valid: true,
            attestation: null,
            errors: [],
            warnings: [],
            slsaLevel: 3,
          });
        } else {
          resolve({
            valid: false,
            attestation: null,
            errors: [stderr || `slsa-verifier exited with code ${code}`],
            warnings: [],
            slsaLevel: 0,
          });
        }
      });

      child.on('error', (error) => {
        resolve({
          valid: false,
          attestation: null,
          errors: [error.message],
          warnings: [],
          slsaLevel: 0,
        });
      });
    });
  }

  /**
   * Check slsa-verifier availability
   */
  async checkAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const { spawn } = require('node:child_process');
      const child = spawn(this.slsaVerifierPath, ['version'], { stdio: 'pipe' });
      child.on('close', (code) => resolve(code === 0));
      child.on('error', () => resolve(false));
    });
  }
}

/**
 * Create SLSA attestation service
 */
export function createSLSAAttestationService(
  privateKey?: string,
  publicKey?: string
): SLSAAttestationService {
  if (privateKey && publicKey) {
    return new SLSAAttestationService(privateKey, publicKey);
  }
  return SLSAAttestationService.fromEnvironment();
}