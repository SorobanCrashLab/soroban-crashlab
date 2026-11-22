/**
 * Artifact Security Hooks
 * 
 * React hooks for integrating artifact security features into the UI.
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { MalwareScanner, ScanResult, QuarantineDecision, ScanJob, ScanStats } from '../scanning/MalwareScanner.js';
import { SignatureVerifier, VerificationResult } from '../verification/SignatureVerifier.js';
import { ReproducerVerifier, ReproducerVerificationResult } from '../verification/ReproducerVerifier.js';
import { QuarantineManager, QuarantineEntry, QuarantineFilter, QuarantineStats } from '../quarantine/QuarantineManager.js';
import { ReproductionExecutor, ReproductionRequest, ReproductionResult } from '../sandbox/ReproductionExecutor.js';
import { SLSAAttestationService, SLSAAttestation, VerificationResult as SLSAVerificationResult } from '../supplychain/SLSAAttestation.js';
import { SBOMGenerator, CycloneDXBOM } from '../supplychain/SBOMGenerator.js';
import { VulnerabilityScanner, ScanResult as VulnScanResult } from '../supplychain/VulnerabilityScanner.js';

export interface UseArtifactSecurityOptions {
  autoInitialize?: boolean;
}

export interface UseArtifactSecurityReturn {
  // Malware scanning
  scanBuffer: (buffer: Buffer, artifactId: string, artifactName: string) => Promise<{ results: ScanResult[]; decision: QuarantineDecision }>;
  scanFile: (filePath: string, artifactId: string, artifactName: string) => Promise<{ results: ScanResult[]; decision: QuarantineDecision }>;
  getScanJob: (jobId: string) => ScanJob | undefined;
  getAllScanJobs: () => ScanJob[];
  getScanStats: () => ScanStats;
  healthCheck: () => Promise<{ clamav: boolean; yara: boolean; overall: boolean }>;
  
  // Signature verification
  verifyArtifact: (artifactId: string, artifactType: string, artifactPath: string, signaturePaths?: string[], certificatePaths?: string[]) => Promise<VerificationResult>;
  verifyReproducer: (reproducer: any, context: any) => Promise<ReproducerVerificationResult>;
  
  // Quarantine management
  quarantineArtifact: (artifactId: string, artifactName: string, artifactType: string, artifactBuffer: Buffer, originalPath: string, reason: any, scanResults: any[]) => Promise<QuarantineEntry>;
  getQuarantineEntry: (id: string) => QuarantineEntry | undefined;
  getQuarantineEntries: (filter?: QuarantineFilter) => QuarantineEntry[];
  getQuarantineStats: () => QuarantineStats;
  startReview: (entryId: string, reviewerId: string, reviewerName: string) => Promise<QuarantineEntry | null>;
  addApproval: (entryId: string, userId: string, userName: string, action: 'approve' | 'reject', notes?: string) => Promise<QuarantineEntry | null>;
  releaseEntry: (entryId: string, releasePath?: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  deleteEntry: (entryId: string, deleteArtifact?: boolean) => Promise<boolean>;
  getArtifactBuffer: (entryId: string) => Promise<Buffer | null>;
  getArtifactBase64: (entryId: string) => Promise<string | null>;
  runRetentionCleanup: () => Promise<{ deleted: number; errors: number }>;
  
  // Reproduction execution
  executeReproduction: (request: ReproductionRequest) => Promise<ReproductionResult>;
  getActiveExecutions: () => number;
  
  // Supply chain
  createSLSAAttestation: (buildInfo: any) => Promise<SLSAAttestation>;
  verifySLSAAttestation: (attestation: SLSAAttestation, trustedKeys?: string[]) => Promise<SLSAVerificationResult>;
  generateSBOM: (sourcePath: string, type: 'npm' | 'cargo' | 'go' | 'python' | 'container' | 'directory') => Promise<CycloneDXBOM>;
  scanVulnerabilities: (target: any, options?: any) => Promise<VulnScanResult[]>;
  
  // State
  isInitialized: boolean;
  isLoading: boolean;
  error: Error | null;
  initialize: () => Promise<void>;
}

export function useArtifactSecurity(options: UseArtifactSecurityOptions = {}): UseArtifactSecurityReturn {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Service instances (would be initialized properly in real app)
  const [malwareScanner] = useState(() => new MalwareScanner());
  const [signatureVerifier] = useState(() => new SignatureVerifier());
  const [reproducerVerifier] = useState(() => new ReproducerVerifier());
  const [quarantineManager] = useState(() => new QuarantineManager());
  const [reproductionExecutor] = useState(() => null as any); // Would be initialized with dependencies
  const [slsaService] = useState(() => new SLSAAttestationService('', ''));
  const [sbomGenerator] = useState(() => new SBOMGenerator());
  const [vulnScanner] = useState(() => new VulnerabilityScanner());

  const initialize = useCallback(async () => {
    if (isInitialized) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      await Promise.all([
        malwareScanner.initialize(),
        quarantineManager.initialize(),
        slsaService.initialize(),
        vulnScanner.initialize(),
      ]);
      
      setIsInitialized(true);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Initialization failed'));
    } finally {
      setIsLoading(false);
    }
  }, [isInitialized, malwareScanner, quarantineManager, slsaService, vulnScanner]);

  useEffect(() => {
    if (options.autoInitialize) {
      initialize();
    }
  }, [options.autoInitialize, initialize]);

  // Malware scanning
  const scanBuffer = useCallback(async (buffer: Buffer, artifactId: string, artifactName: string) => {
    if (!isInitialized) await initialize();
    return malwareScanner.scanBuffer(buffer, artifactId, artifactName);
  }, [isInitialized, initialize, malwareScanner]);

  const scanFile = useCallback(async (filePath: string, artifactId: string, artifactName: string) => {
    if (!isInitialized) await initialize();
    return malwareScanner.scanFile(filePath, artifactId, artifactName);
  }, [isInitialized, initialize, malwareScanner]);

  const getScanJob = useCallback((jobId: string) => malwareScanner.getJob(jobId), [malwareScanner]);
  const getAllScanJobs = useCallback(() => malwareScanner.getAllJobs(), [malwareScanner]);
  const getScanStats = useCallback(() => malwareScanner.getStats(), [malwareScanner]);
  const healthCheck = useCallback(() => malwareScanner.healthCheck(), [malwareScanner]);

  // Signature verification
  const verifyArtifact = useCallback(async (
    artifactId: string,
    artifactType: string,
    artifactPath: string,
    signaturePaths: string[] = [],
    certificatePaths: string[] = []
  ) => {
    return signatureVerifier.verifyArtifact(artifactId, artifactType, artifactPath, signaturePaths, certificatePaths);
  }, [signatureVerifier]);

  const verifyReproducer = useCallback(async (reproducer: any, context: any) => {
    return reproducerVerifier.verifyReproducer(reproducer, context);
  }, [reproducerVerifier]);

  // Quarantine management
  const quarantineArtifact = useCallback(async (
    artifactId: string,
    artifactName: string,
    artifactType: string,
    artifactBuffer: Buffer,
    originalPath: string,
    reason: any,
    scanResults: any[]
  ) => {
    if (!isInitialized) await initialize();
    return quarantineManager.quarantineArtifact(
      artifactId, artifactName, artifactType, artifactBuffer, originalPath, reason, scanResults
    );
  }, [isInitialized, initialize, quarantineManager]);

  const getQuarantineEntry = useCallback((id: string) => quarantineManager.getEntry(id), [quarantineManager]);
  const getQuarantineEntries = useCallback((filter?: QuarantineFilter) => quarantineManager.getEntries(filter), [quarantineManager]);
  const getQuarantineStats = useCallback(() => quarantineManager.getStats(), [quarantineManager]);
  const startReview = useCallback((entryId: string, reviewerId: string, reviewerName: string) => 
    quarantineManager.startReview(entryId, reviewerId, reviewerName), [quarantineManager]);
  const addApproval = useCallback((entryId: string, userId: string, userName: string, action: 'approve' | 'reject', notes?: string) =>
    quarantineManager.addApproval(entryId, userId, userName, action, notes), [quarantineManager]);
  const releaseEntry = useCallback((entryId: string, releasePath?: string) =>
    quarantineManager.releaseEntry(entryId, releasePath), [quarantineManager]);
  const deleteEntry = useCallback((entryId: string, deleteArtifact?: boolean) =>
    quarantineManager.deleteEntry(entryId, deleteArtifact), [quarantineManager]);
  const getArtifactBuffer = useCallback((entryId: string) => quarantineManager.getArtifactBuffer(entryId), [quarantineManager]);
  const getArtifactBase64 = useCallback((entryId: string) => quarantineManager.getArtifactBase64(entryId), [quarantineManager]);
  const runRetentionCleanup = useCallback(() => quarantineManager.runRetentionCleanup(), [quarantineManager]);

  // Reproduction execution
  const executeReproduction = useCallback(async (request: ReproductionRequest) => {
    if (!reproductionExecutor) {
      throw new Error('Reproduction executor not initialized');
    }
    return reproductionExecutor.execute(request);
  }, [reproductionExecutor]);

  const getActiveExecutions = useCallback(() => reproductionExecutor?.getActiveCount() || 0, [reproductionExecutor]);

  // Supply chain
  const createSLSAAttestation = useCallback(async (buildInfo: any) => {
    return slsaService.createAttestation(buildInfo);
  }, [slsaService]);

  const verifySLSAAttestation = useCallback(async (attestation: SLSAAttestation, trustedKeys?: string[]) => {
    return slsaService.verifyAttestation(attestation, trustedKeys);
  }, [slsaService]);

  const generateSBOM = useCallback(async (sourcePath: string, type: 'npm' | 'cargo' | 'go' | 'python' | 'container' | 'directory') => {
    switch (type) {
      case 'npm':
        return sbomGenerator.generateFromNpm(sourcePath);
      case 'cargo':
        return sbomGenerator.generateFromCargo(sourcePath);
      case 'go':
        return sbomGenerator.generateFromGoMod(sourcePath);
      case 'python':
        return sbomGenerator.generateFromPython(sourcePath);
      case 'container':
        return sbomGenerator.generateFromContainer(sourcePath);
      case 'directory':
        return sbomGenerator.generateFromDirectory(sourcePath);
    }
  }, [sbomGenerator]);

  const scanVulnerabilities = useCallback(async (target: any, options?: any) => {
    return vulnScanner.scan(target, options);
  }, [vulnScanner]);

  return {
    // Malware scanning
    scanBuffer,
    scanFile,
    getScanJob,
    getAllScanJobs,
    getScanStats,
    healthCheck,
    
    // Signature verification
    verifyArtifact,
    verifyReproducer,
    
    // Quarantine management
    quarantineArtifact,
    getQuarantineEntry,
    getQuarantineEntries,
    getQuarantineStats,
    startReview,
    addApproval,
    releaseEntry,
    deleteEntry,
    getArtifactBuffer,
    getArtifactBase64,
    runRetentionCleanup,
    
    // Reproduction execution
    executeReproduction,
    getActiveExecutions,
    
    // Supply chain
    createSLSAAttestation,
    verifySLSAAttestation,
    generateSBOM,
    scanVulnerabilities,
    
    // State
    isInitialized,
    isLoading,
    error,
    initialize,
  };
}