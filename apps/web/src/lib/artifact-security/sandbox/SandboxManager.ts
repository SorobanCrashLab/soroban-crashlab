/**
 * Sandbox Manager
 * 
 * Manages gVisor/Kata container lifecycle for sandboxed reproduction execution.
 * Handles container creation, execution, monitoring, and cleanup.
 */

import { spawn, ChildProcess, SpawnOptions } from 'node:child_process';
import { writeFile, readFile, mkdir, rm, mkdtemp } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import {
  SandboxProfileConfig,
  SandboxRuntime,
  ResourceLimits,
  DEFAULT_REPRODUCTION_PROFILE,
  profileToGVisorConfig,
  profileToKataConfig,
} from './SandboxProfile.js';

export interface SandboxContainer {
  id: string;
  profile: SandboxProfileConfig;
  status: 'creating' | 'running' | 'stopped' | 'failed' | 'cleanup';
  pid?: number;
  startedAt?: string;
  stoppedAt?: string;
  exitCode?: number;
  error?: string;
  resourceUsage: ResourceUsage;
  logs: string[];
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

export interface ExecutionRequest {
  id: string;
  image: string;
  command: string[];
  args: string[];
  environment: Record<string, string>;
  workingDir: string;
  stdin?: string;
  timeoutSeconds: number;
  profile: string; // Profile name
  artifactPaths: string[]; // Paths to mount as read-only
  outputPaths: string[]; // Paths to capture output from
}

export interface ExecutionResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  resourceUsage: ResourceUsage;
  attestation?: SandboxAttestation;
  error?: string;
}

export interface SandboxAttestation {
  sandboxId: string;
  timestamp: string;
  profile: string;
  image: string;
  command: string[];
  exitCode: number;
  resourceUsage: ResourceUsage;
  measurements: Measurement[];
  signature: string;
  publicKey: string;
}

export interface Measurement {
  name: string;
  value: string;
  type: 'hash' | 'counter' | 'gauge' | 'timer';
}

export interface SandboxManagerOptions {
  runtime: SandboxRuntime;
  profilesDir: string;
  imagesDir: string;
  defaultProfile: string;
  runscPath?: string;
  kataRuntimePath?: string;
  dockerPath?: string;
}

export class SandboxManager {
  private runtime: SandboxRuntime;
  private profilesDir: string;
  private imagesDir: string;
  private defaultProfile: string;
  private runscPath: string;
  private kataRuntimePath: string;
  private dockerPath: string;
  private containers: Map<string, SandboxContainer> = new Map();
  private activeExecutions: Map<string, ChildProcess> = new Map();

  constructor(options: SandboxManagerOptions) {
    this.runtime = options.runtime;
    this.profilesDir = options.profilesDir;
    this.imagesDir = options.imagesDir;
    this.defaultProfile = options.defaultProfile;
    this.runscPath = options.runscPath || 'runsc';
    this.kataRuntimePath = options.kataRuntimePath || 'kata-runtime';
    this.dockerPath = options.dockerPath || 'docker';
  }

  /**
   * Initialize sandbox manager
   */
  async initialize(): Promise<void> {
    await mkdir(this.profilesDir, { recursive: true });
    await mkdir(this.imagesDir, { recursive: true });
    
    // Verify runtime is available
    await this.verifyRuntime();
    
    // Save default profiles
    await this.saveDefaultProfiles();
  }

  /**
   * Verify runtime availability
   */
  private async verifyRuntime(): Promise<void> {
    const runtime = this.runtime === 'gvisor' ? this.runscPath : 
                    this.runtime === 'kata' ? this.kataRuntimePath :
                    this.dockerPath;

    return new Promise((resolve, reject) => {
      const child = spawn(runtime, ['version'], { stdio: 'pipe' });
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`${runtime} not available or failed`));
      });
      child.on('error', () => reject(new Error(`${runtime} not found in PATH`)));
    });
  }

  /**
   * Save default profiles to disk
   */
  private async saveDefaultProfiles(): Promise<void> {
    const profiles = [
      DEFAULT_REPRODUCTION_PROFILE,
      // Would include strict/trusted from SandboxProfile.ts
    ];

    for (const profile of profiles) {
      await writeFile(
        join(this.profilesDir, `${profile.name}.json`),
        JSON.stringify(profile, null, 2)
      );
    }
  }

  /**
   * Get profile by name
   */
  async getProfile(name: string): Promise<SandboxProfileConfig> {
    try {
      const content = await readFile(join(this.profilesDir, `${name}.json`), 'utf-8');
      return JSON.parse(content);
    } catch {
      // Return built-in defaults
      switch (name) {
        case 'strict':
          return { ...DEFAULT_REPRODUCTION_PROFILE, name: 'strict' };
        case 'trusted':
          return { ...DEFAULT_REPRODUCTION_PROFILE, name: 'trusted' };
        default:
          return DEFAULT_REPRODUCTION_PROFILE;
      }
    }
  }

  /**
   * Create a sandbox container
   */
  async createContainer(profileName: string = this.defaultProfile): Promise<SandboxContainer> {
    const profile = await this.getProfile(profileName);
    const containerId = uuidv4();

    const container: SandboxContainer = {
      id: containerId,
      profile,
      status: 'creating',
      resourceUsage: this.emptyResourceUsage(),
      logs: [],
    };

    this.containers.set(containerId, container);

    try {
      // Prepare container based on runtime
      switch (this.runtime) {
        case 'gvisor':
          await this.prepareGVisorContainer(container);
          break;
        case 'kata':
          await this.prepareKataContainer(container);
          break;
        case 'docker':
          await this.prepareDockerContainer(container);
          break;
        case 'firecracker':
          await this.prepareFirecrackerContainer(container);
          break;
      }

      container.status = 'running';
      container.startedAt = new Date().toISOString();
      this.containers.set(containerId, container);

      return container;
    } catch (error) {
      container.status = 'failed';
      container.error = error instanceof Error ? error.message : 'Unknown error';
      this.containers.set(containerId, container);
      throw error;
    }
  }

  /**
   * Prepare gVisor container (runsc)
   */
  private async prepareGVisorContainer(container: SandboxContainer): Promise<void> {
    const config = profileToGVisorConfig(container.profile);
    const configPath = join(tmpdir(), `runsc-${container.id}.json`);
    await writeFile(configPath, JSON.stringify(config));

    // For gVisor, we typically run directly with runsc run
    // The container is created on-demand during execution
    container.logs.push(`gVisor config prepared: ${configPath}`);
  }

  /**
   * Prepare Kata Container
   */
  private async prepareKataContainer(container: SandboxContainer): Promise<void> {
    const config = profileToKataConfig(container.profile);
    const configPath = join(tmpdir(), `kata-${container.id}.json`);
    await writeFile(configPath, JSON.stringify(config));

    container.logs.push(`Kata config prepared: ${configPath}`);
  }

  /**
   * Prepare Docker container
   */
  private async prepareDockerContainer(container: SandboxContainer): Promise<void> {
    const profile = container.profile;
    
    // Build docker create command
    const args = ['create', '--name', `crashlab-${container.id}`];
    
    // Resource limits
    args.push('--cpus', String(profile.resources.cpuQuota / profile.resources.cpuPeriod));
    args.push('--memory', `${profile.resources.memoryLimitBytes}b`);
    args.push('--memory-swap', `${profile.resources.memorySwapLimitBytes}b`);
    args.push('--pids-limit', String(profile.resources.pidsLimit));
    args.push('--ulimit', `nofile=${profile.resources.openFilesLimit}:${profile.resources.openFilesLimit}`);
    
    // Security
    args.push('--security-opt', 'no-new-privileges=true');
    args.push('--cap-drop', 'ALL');
    args.push('--read-only');
    
    // Namespaces
    if (!profile.namespaces.network) args.push('--network', 'none');
    if (!profile.namespaces.ipc) args.push('--ipc', 'none');
    if (!profile.namespaces.pid) args.push('--pid', 'host');
    
    // Tmpfs mounts
    for (const tmpfs of profile.filesystem.tmpfsMounts) {
      args.push('--tmpfs', `${tmpfs.path}:size=${tmpfs.sizeBytes},mode=${tmpfs.mode.toString(8)},${tmpfs.options.join(',')}`);
    }
    
    // Bind mounts
    for (const bind of profile.filesystem.bindMounts) {
      args.push('--mount', `type=bind,source=${bind.source},target=${bind.target},readonly=${bind.readonly}`);
    }
    
    // Working directory and user
    args.push('--workdir', profile.workingDir);
    args.push('--user', profile.user);
    
    // Environment
    for (const [key, value] of Object.entries(profile.environment)) {
      args.push('--env', `${key}=${value}`);
    }
    
    // Image
    args.push(profile.environment.IMAGE || 'crashlab/reproduction:latest');
    
    // Entrypoint - keep container running
    args.push('sleep', 'infinity');

    container.logs.push(`Docker create command: ${args.join(' ')}`);
  }

  /**
   * Prepare Firecracker container
   */
  private async prepareFirecrackerContainer(container: SandboxContainer): Promise<void> {
    // Firecracker would use jailer/firecracker directly
    container.logs.push('Firecracker container preparation not fully implemented');
  }

  /**
   * Execute a command in a sandbox
   */
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const startTime = Date.now();
    const executionId = uuidv4();
    
    // Get or create container
    let container = this.containers.get(request.id);
    if (!container) {
      container = await this.createContainer(request.profile);
    }

    container.status = 'running';
    this.containers.set(container.id, container);

    try {
      let result: ExecutionResult;
      
      switch (this.runtime) {
        case 'gvisor':
          result = await this.executeGVisor(container, request, executionId);
          break;
        case 'kata':
          result = await this.executeKata(container, request, executionId);
          break;
        case 'docker':
          result = await this.executeDocker(container, request, executionId);
          break;
        case 'firecracker':
          result = await this.executeFirecracker(container, request, executionId);
          break;
        default:
          throw new Error(`Unknown runtime: ${this.runtime}`);
      }

      result.durationMs = Date.now() - startTime;
      container.status = 'stopped';
      container.stoppedAt = new Date().toISOString();
      container.exitCode = result.exitCode;
      container.resourceUsage = result.resourceUsage;
      this.containers.set(container.id, container);

      return result;
    } catch (error) {
      container.status = 'failed';
      container.error = error instanceof Error ? error.message : 'Execution failed';
      this.containers.set(container.id, container);
      throw error;
    }
  }

  /**
   * Execute with gVisor (runsc)
   */
  private async executeGVisor(
    container: SandboxContainer,
    request: ExecutionRequest,
    executionId: string
  ): Promise<ExecutionResult> {
    const profile = container.profile;
    const configPath = join(tmpdir(), `runsc-${executionId}.json`);
    await writeFile(configPath, JSON.stringify(profileToGVisorConfig(profile)));

    const args = [
      'run',
      '--platform', 'ptrace',
      '--config', configPath,
      '--network', profile.network.enabled ? 'host' : 'none',
      '--cpus', String(profile.resources.cpuQuota / profile.resources.cpuPeriod),
      '--memory', `${profile.resources.memoryLimitBytes}`,
      '--pids-limit', String(profile.resources.pidsLimit),
    ];

    // Add bind mounts for artifacts
    for (const artifactPath of request.artifactPaths) {
      args.push('--bind', `${artifactPath}:${artifactPath}:ro`);
    }

    // Add tmpfs mounts
    for (const tmpfs of profile.filesystem.tmpfsMounts) {
      args.push('--tmpfs', `${tmpfs.path}:size=${tmpfs.sizeBytes},mode=${tmpfs.mode.toString(8)}`);
    }

    args.push('--', ...request.command, ...request.args);

    return this.runCommand(this.runscPath, args, request, executionId, container);
  }

  /**
   * Execute with Kata Containers
   */
  private async executeKata(
    container: SandboxContainer,
    request: ExecutionRequest,
    executionId: string
  ): Promise<ExecutionResult> {
    // Kata uses docker-compatible CLI via kata-runtime
    const profile = container.profile;
    
    const args = [
      'run',
      '--rm',
      '--runtime', 'kata-runtime',
      '--cpus', String(profile.resources.cpuQuota / profile.resources.cpuPeriod),
      '--memory', `${profile.resources.memoryLimitBytes}b`,
      '--memory-swap', `${profile.resources.memorySwapLimitBytes}b`,
      '--pids-limit', String(profile.resources.pidsLimit),
      '--security-opt', 'no-new-privileges=true',
      '--cap-drop', 'ALL',
      '--read-only',
      '--network', profile.network.enabled ? 'bridge' : 'none',
      '--workdir', profile.workingDir,
      '--user', profile.user,
    ];

    for (const [key, value] of Object.entries(request.environment)) {
      args.push('--env', `${key}=${value}`);
    }

    for (const artifactPath of request.artifactPaths) {
      args.push('--mount', `type=bind,source=${artifactPath},target=${artifactPath},readonly=true`);
    }

    args.push(request.image);
    args.push(...request.command, ...request.args);

    return this.runCommand(this.dockerPath, args, request, executionId, container);
  }

  /**
   * Execute with Docker
   */
  private async executeDocker(
    container: SandboxContainer,
    request: ExecutionRequest,
    executionId: string
  ): Promise<ExecutionResult> {
    const profile = container.profile;
    
    const args = [
      'run',
      '--rm',
      '--cpus', String(profile.resources.cpuQuota / profile.resources.cpuPeriod),
      '--memory', `${profile.resources.memoryLimitBytes}b`,
      '--memory-swap', `${profile.resources.memorySwapLimitBytes}b`,
      '--pids-limit', String(profile.resources.pidsLimit),
      '--security-opt', 'no-new-privileges=true',
      '--cap-drop', 'ALL',
      '--read-only',
      '--network', profile.network.enabled ? 'bridge' : 'none',
      '--workdir', profile.workingDir,
      '--user', profile.user,
    ];

    for (const [key, value] of Object.entries(request.environment)) {
      args.push('--env', `${key}=${value}`);
    }

    for (const artifactPath of request.artifactPaths) {
      args.push('--mount', `type=bind,source=${artifactPath},target=${artifactPath},readonly=true`);
    }

    for (const tmpfs of profile.filesystem.tmpfsMounts) {
      args.push('--tmpfs', `${tmpfs.path}:size=${tmpfs.sizeBytes},mode=${tmpfs.mode.toString(8)},${tmpfs.options.join(',')}`);
    }

    args.push(request.image);
    args.push(...request.command, ...request.args);

    return this.runCommand(this.dockerPath, args, request, executionId, container);
  }

  /**
   * Execute with Firecracker
   */
  private async executeFirecracker(
    container: SandboxContainer,
    request: ExecutionRequest,
    executionId: string
  ): Promise<ExecutionResult> {
    // Firecracker execution would use firecracker/jailer directly
    throw new Error('Firecracker execution not implemented');
  }

  /**
   * Run command with timeout and resource monitoring
   */
  private async runCommand(
    command: string,
    args: string[],
    request: ExecutionRequest,
    executionId: string,
    container: SandboxContainer
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const timeoutMs = request.timeoutSeconds * 1000;

    return new Promise((resolve, reject) => {
      const options: SpawnOptions = {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
      };

      const child = spawn(command, args, options);
      this.activeExecutions.set(executionId, child);

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
        // Limit log size
        if (stdout.length > container.profile.maxLogSizeBytes) {
          child.kill('SIGKILL');
        }
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
        if (stderr.length > container.profile.maxLogSizeBytes) {
          child.kill('SIGKILL');
        }
      });

      // Handle stdin if provided
      if (request.stdin && child.stdin) {
        child.stdin.write(request.stdin);
        child.stdin.end();
      }

      child.on('close', async (code) => {
        this.activeExecutions.delete(executionId);
        
        const durationMs = Date.now() - startTime;
        const resourceUsage = await this.getResourceUsage(child.pid || 0);

        // Generate attestation
        const attestation = await this.generateAttestation(
          container.id,
          request,
          code || 0,
          resourceUsage,
          durationMs
        );

        resolve({
          success: code === 0,
          exitCode: code || 0,
          stdout,
          stderr,
          durationMs,
          resourceUsage,
          attestation,
        });
      });

      child.on('error', (error) => {
        this.activeExecutions.delete(executionId);
        reject(error);
      });
    });
  }

  /**
   * Get resource usage for a process
   */
  private async getResourceUsage(pid: number): Promise<ResourceUsage> {
    // In a real implementation, this would read from /proc/pid/stat, cgroups, etc.
    // For now, return empty usage
    return this.emptyResourceUsage();
  }

  /**
   * Generate attestation for execution
   */
  private async generateAttestation(
    sandboxId: string,
    request: ExecutionRequest,
    exitCode: number,
    resourceUsage: ResourceUsage,
    durationMs: number
  ): Promise<SandboxAttestation> {
    const measurements: Measurement[] = [
      { name: 'cpu_time_ms', value: String(resourceUsage.cpuTimeMs), type: 'counter' },
      { name: 'memory_bytes', value: String(resourceUsage.memoryBytes), type: 'gauge' },
      { name: 'peak_memory_bytes', value: String(resourceUsage.peakMemoryBytes), type: 'gauge' },
      { name: 'duration_ms', value: String(durationMs), type: 'timer' },
      { name: 'exit_code', value: String(exitCode), type: 'counter' },
    ];

    // In real implementation, sign with sandbox's attestation key
    const signature = 'placeholder-signature';
    const publicKey = 'placeholder-public-key';

    return {
      sandboxId,
      timestamp: new Date().toISOString(),
      profile: request.profile,
      image: request.image,
      command: [...request.command, ...request.args],
      exitCode,
      resourceUsage,
      measurements,
      signature,
      publicKey,
    };
  }

  /**
   * Stop and cleanup a container
   */
  async stopContainer(containerId: string): Promise<void> {
    const container = this.containers.get(containerId);
    if (!container) return;

    container.status = 'cleanup';
    this.containers.set(containerId, container);

    try {
      switch (this.runtime) {
        case 'gvisor':
          // runsc doesn't have persistent containers
          break;
        case 'kata':
        case 'docker':
          await this.runDockerCommand(['stop', `crashlab-${containerId}`]);
          await this.runDockerCommand(['rm', `crashlab-${containerId}`]);
          break;
      }
    } catch (error) {
      console.warn(`Failed to cleanup container ${containerId}:`, error);
    }

    this.containers.delete(containerId);
  }

  /**
   * Run docker command
   */
  private async runDockerCommand(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.dockerPath, args, { stdio: 'pipe' });
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Docker command failed: ${args.join(' ')}`));
      });
      child.on('error', reject);
    });
  }

  /**
   * Get container status
   */
  getContainer(containerId: string): SandboxContainer | undefined {
    return this.containers.get(containerId);
  }

  /**
   * List all containers
   */
  listContainers(): SandboxContainer[] {
    return Array.from(this.containers.values());
  }

  /**
   * Cleanup all containers
   */
  async cleanup(): Promise<void> {
    for (const container of this.containers.values()) {
      await this.stopContainer(container.id);
    }
    
    // Kill any remaining executions
    for (const [id, child] of this.activeExecutions) {
      child.kill('SIGKILL');
    }
    this.activeExecutions.clear();
  }

  private emptyResourceUsage(): ResourceUsage {
    return {
      cpuTimeMs: 0,
      memoryBytes: 0,
      peakMemoryBytes: 0,
      networkRxBytes: 0,
      networkTxBytes: 0,
      diskReadBytes: 0,
      diskWriteBytes: 0,
      pidsCount: 0,
    };
  }
}

/**
 * Create sandbox manager from environment
 */
export function createSandboxManager(options: Partial<SandboxManagerOptions> = {}): SandboxManager {
  return new SandboxManager({
    runtime: (options.runtime as SandboxRuntime) || (process.env.SANDBOX_RUNTIME as SandboxRuntime) || 'gvisor',
    profilesDir: options.profilesDir || process.env.SANDBOX_PROFILES_DIR || '/etc/crashlab/sandbox/profiles',
    imagesDir: options.imagesDir || process.env.SANDBOX_IMAGES_DIR || '/var/lib/crashlab/sandbox/images',
    defaultProfile: options.defaultProfile || 'standard',
    runscPath: options.runscPath,
    kataRuntimePath: options.kataRuntimePath,
    dockerPath: options.dockerPath,
  });
}