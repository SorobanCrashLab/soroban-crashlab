/**
 * Reproduction Executor
 * 
 * High-level interface for executing crash reproducers in sandboxed environments.
 * Handles artifact mounting, execution, result collection, and attestation.
 */

import { SandboxManager } from './SandboxManager.js';
import { SandboxProfileConfig, DEFAULT_REPRODUCTION_PROFILE } from './SandboxProfile.js';
import { SandboxAttestation, ExecutionRequest, ExecutionResult } from './SandboxManager.js';
import { ReproducerPackage, ReproducerVerifier } from '../verification/ReproducerVerifier.js';
import { MalwareScanner } from '../scanning/MalwareScanner.js';
import { QuarantineManager, QuarantineReason } from '../quarantine/QuarantineManager.js';

export interface ReproductionConfig {
  sandboxManager: SandboxManager;
  malwareScanner: MalwareScanner;
  reproducerVerifier: ReproducerVerifier;
  quarantineManager: QuarantineManager;
  defaultImage: string;
  defaultProfile: string;
  maxConcurrentExecutions: number;
}

export interface ReproductionRequest {
  reproducer: ReproducerPackage;
  artifacts: ArtifactInput[];
  environment: Record<string, string>;
  requestedCapabilities: string[];
  timeoutSeconds: number;
  profile?: string;
  requestedBy: string;
}

export interface ArtifactInput {
  id: string;
  name: string;
  type: string;
  buffer: Buffer;
  mountPath: string;
  verifySignature: boolean;
}

export interface ReproductionResult {
  success: boolean;
  executionId: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  resourceUsage: ResourceUsage;
  attestation?: SandboxAttestation;
  artifactsProduced: ProducedArtifact[];
  error?: string;
  quarantineInfo?: QuarantineInfo;
}

export interface ResourceUsage {
  cpuTimeMs: number;
  memoryBytes: number;
  peakMemoryBytes: number;
  networkRxBytes: number;
  networkTxBytes: number;
  diskReadBytes: number;
  diskWriteBytes: number;
  pidsCount: number;
}

export interface ProducedArtifact {
  id: string;
  name: string;
  type: string;
  size: number;
  path: string;
  hash: string;
  metadata: Record<string, string>;
}

export interface QuarantineInfo {
  quarantined: boolean;
  quarantineId?: string;
  reason?: string;
}

export interface ExecutionContext {
  executionId: string;
  reproducer: ReproducerPackage;
  artifacts: ArtifactInput[];
  tempDir: string;
  mountPaths: Map<string, string>; // artifactId -> mountPath
  startTime: number;
}

export class ReproductionExecutor {
  private config: ReproductionConfig;
  private activeExecutions: Map<string, ExecutionContext> = new Map();
  private semaphore: number = 0;

  constructor(config: ReproductionConfig) {
    this.config = config;
  }

  /**
   * Execute a crash reproducer
   */
  async execute(request: ReproductionRequest): Promise<ReproductionResult> {
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();

    // Check concurrency limit
    await this.acquireSlot();

    try {
      // 1. Verify reproducer signature and metadata
      const verification = await this.config.reproducerVerifier.verifyReproducer(request.reproducer, {
        artifactId: executionId,
        artifactType: 'reproducer-script',
        requestedCapabilities: request.requestedCapabilities,
        environment: 'production',
        requestedBy: request.requestedBy,
      });

      if (!verification.allowed) {
        return this.createFailureResult(executionId, startTime, verification.reason, 'rejected');
      }

      // 2. Scan and quarantine artifacts if needed
      const quarantineInfo = await this.scanAndQuarantineArtifacts(request.artifacts, executionId);
      if (quarantineInfo.quarantined) {
        return this.createFailureResult(executionId, startTime, `Artifacts quarantined: ${quarantineInfo.reason}`, 'quarantined', quarantineInfo);
      }

      // 3. Prepare execution environment
      const context = await this.prepareExecution(executionId, request);

      // 4. Execute in sandbox
      const result = await this.runInSandbox(context, request);

      // 5. Collect produced artifacts
      const producedArtifacts = await this.collectArtifacts(context, request);

      // 6. Cleanup
      await this.cleanup(context);

      return {
        success: result.success,
        executionId,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: result.durationMs,
        resourceUsage: result.resourceUsage,
        attestation: result.attestation,
        artifactsProduced: producedArtifacts,
        error: result.error,
        quarantineInfo,
      };
    } catch (error) {
      return this.createFailureResult(executionId, startTime, error instanceof Error ? error.message : 'Unknown error', 'error');
    } finally {
      this.releaseSlot();
      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * Scan artifacts for malware and quarantine if needed
   */
  private async scanAndQuarantineArtifacts(
    artifacts: ArtifactInput[],
    executionId: string
  ): Promise<QuarantineInfo> {
    for (const artifact of artifacts) {
      const { results, decision } = await this.config.malwareScanner.scanBuffer(
        artifact.buffer,
        artifact.id,
        artifact.name
      );

      if (decision.action === 'quarantine') {
        const quarantineId = await this.config.quarantineManager.quarantineArtifact(
          artifact.id,
          artifact.name,
          artifact.type,
          artifact.buffer,
          artifact.mountPath,
          'malware',
          results.map(r => ({
            scanner: r.scanner,
            verdict: r.verdict,
            timestamp: r.timestamp,
            matches: r.matches.length,
            details: r.matches.map(m => m.rule).join(', '),
          })),
          2, // required approvals
          90 // retention days
        );

        return {
          quarantined: true,
          quarantineId: quarantineId.id,
          reason: decision.reason,
        };
      }
    }

    return { quarantined: false };
  }

  /**
   * Prepare execution environment
   */
  private async prepareExecution(
    executionId: string,
    request: ReproductionRequest
  ): Promise<ExecutionContext> {
    const tempDir = await import('node:fs/promises').then(fs => fs.mkdtemp(join(import('node:os').tmpdir(), `crashlab-${executionId}-`)));
    const mountPaths = new Map<string, string>();

    // Write artifact files to temp directory
    for (const artifact of request.artifacts) {
      const artifactPath = join(tempDir, 'artifacts', artifact.id);
      await import('node:fs/promises').then(fs => fs.mkdir(dirname(artifactPath), { recursive: true }));
      await import('node:fs/promises').then(fs => fs.writeFile(artifactPath, artifact.buffer));
      mountPaths.set(artifact.id, artifactPath);
    }

    // Write reproducer script
    const reproducerPath = join(tempDir, 'reproducer.js');
    await import('node:fs/promises').then(fs => fs.writeFile(reproducerPath, request.reproducer.script));
    mountPaths.set('reproducer', reproducerPath);

    // Write metadata
    const metadataPath = join(tempDir, 'metadata.json');
    await import('node:fs/promises').then(fs => fs.writeFile(metadataPath, JSON.stringify({
      reproducer: request.reproducer.metadata,
      artifacts: request.artifacts.map(a => ({ id: a.id, name: a.name, type: a.type })),
      environment: request.environment,
      capabilities: request.requestedCapabilities,
    }, null, 2)));
    mountPaths.set('metadata', metadataPath);

    const context: ExecutionContext = {
      executionId,
      reproducer: request.reproducer,
      artifacts: request.artifacts,
      tempDir,
      mountPaths,
      startTime: Date.now(),
    };

    this.activeExecutions.set(executionId, context);
    return context;
  }

  /**
   * Run reproduction in sandbox
   */
  private async runInSandbox(
    context: ExecutionContext,
    request: ReproductionRequest
  ): Promise<ExecutionResult> {
    const profile = request.profile || this.config.defaultProfile;
    const sandboxProfile = await this.config.sandboxManager.getProfile(profile);

    // Build execution request for sandbox
    const sandboxRequest: ExecutionRequest = {
      id: context.executionId,
      image: this.config.defaultImage,
      command: ['node'],
      args: ['/workspace/reproducer.js'],
      environment: {
        ...sandboxProfile.environment,
        ...request.environment,
        CRASHLAB_EXECUTION_ID: context.executionId,
        CRASHLAB_REPRODUCER_ID: context.reproducer.metadata.id,
        CRASHLAB_ARTIFACT_DIR: '/workspace/artifacts',
        CRASHLAB_OUTPUT_DIR: '/workspace/output',
      },
      workingDir: sandboxProfile.workingDir,
      timeoutSeconds: Math.min(request.timeoutSeconds, sandboxProfile.timeoutSeconds),
      profile,
      artifactPaths: Array.from(context.mountPaths.values()),
      outputPaths: ['/workspace/output'],
    };

    // Create output directory
    await import('node:fs/promises').then(fs => fs.mkdir(join(context.tempDir, 'output'), { recursive: true }));
    sandboxRequest.artifactPaths.push(join(context.tempDir, 'output'));

    return this.config.sandboxManager.execute(sandboxRequest);
  }

  /**
   * Collect produced artifacts from sandbox output
   */
  private async collectArtifacts(
    context: ExecutionContext,
    request: ReproductionRequest
  ): Promise<ProducedArtifact[]> {
    const outputDir = join(context.tempDir, 'output');
    const artifacts: ProducedArtifact[] = [];

    try {
      const { readdir, stat, readFile } = await import('node:fs/promises');
      const entries = await readdir(outputDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile()) {
          const filePath = join(outputDir, entry.name);
          const fileStat = await stat(filePath);
          const buffer = await readFile(filePath);
          
          const crypto = await import('node:crypto');
          const hash = crypto.createHash('sha256').update(buffer).digest('hex');

          artifacts.push({
            id: `artifact-${context.executionId}-${entry.name}`,
            name: entry.name,
            type: this.guessArtifactType(entry.name),
            size: fileStat.size,
            path: filePath,
            hash,
            metadata: {
              executionId: context.executionId,
              reproducerId: context.reproducer.metadata.id,
              producedAt: new Date().toISOString(),
            },
          });
        }
      }
    } catch (error) {
      console.warn('Failed to collect artifacts:', error);
    }

    return artifacts;
  }

  /**
   * Cleanup execution context
   */
  private async cleanup(context: ExecutionContext): Promise<void> {
    try {
      await import('node:fs/promises').then(fs => fs.rm(context.tempDir, { recursive: true, force: true }));
    } catch (error) {
      console.warn(`Failed to cleanup execution ${context.executionId}:`, error);
    }
  }

  /**
   * Guess artifact type from filename
   */
  private guessArtifactType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'json': return 'json';
      case 'log': return 'log';
      case 'trace': return 'trace';
      case 'coverage': return 'coverage';
      case 'crash': return 'crash-bundle';
      case 'bin': return 'binary';
      case 'wasm': return 'wasm';
      default: return 'unknown';
    }
  }

  /**
   * Acquire execution slot (semaphore)
   */
  private async acquireSlot(): Promise<void> {
    while (this.semaphore >= this.config.maxConcurrentExecutions) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    this.semaphore++;
  }

  /**
   * Release execution slot
   */
  private releaseSlot(): void {
    this.semaphore = Math.max(0, this.semaphore - 1);
  }

  /**
   * Create failure result
   */
  private createFailureResult(
    executionId: string,
    startTime: number,
    error: string,
    type: 'rejected' | 'quarantined' | 'error',
    quarantineInfo?: QuarantineInfo
  ): ReproductionResult {
    return {
      success: false,
      executionId,
      exitCode: -1,
      stdout: '',
      stderr: error,
      durationMs: Date.now() - startTime,
      resourceUsage: {
        cpuTimeMs: 0,
        memoryBytes: 0,
        peakMemoryBytes: 0,
        networkRxBytes: 0,
        networkTxBytes: 0,
        diskReadBytes: 0,
        diskWriteBytes: 0,
        pidsCount: 0,
      },
      artifactsProduced: [],
      error,
      quarantineInfo,
    };
  }

  /**
   * Get active execution count
   */
  getActiveCount(): number {
    return this.activeExecutions.size;
  }

  /**
   * Get execution context
   */
  getExecution(executionId: string): ExecutionContext | undefined {
    return this.activeExecutions.get(executionId);
  }
}

/**
 * Create reproduction executor with default configuration
 */
export function createReproductionExecutor(
  sandboxManager: SandboxManager,
  malwareScanner: MalwareScanner,
  reproducerVerifier: ReproducerVerifier,
  quarantineManager: QuarantineManager,
  options: Partial<ReproductionConfig> = {}
): ReproductionExecutor {
  return new ReproductionExecutor({
    sandboxManager,
    malwareScanner,
    reproducerVerifier,
    quarantineManager,
    defaultImage: options.defaultImage || 'crashlab/reproduction:latest',
    defaultProfile: options.defaultProfile || 'standard',
    maxConcurrentExecutions: options.maxConcurrentExecutions || 4,
  });
}