/**
 * gVisor Integration
 * 
 * Wrapper for runsc (gVisor) commands and configuration.
 * Provides high-level interface for gVisor sandbox operations.
 */

import { spawn, SpawnOptions } from 'node:child_process';
import { writeFile, readFile, mkdir, rm, mkdtemp } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { v4 as uuidv4 } from 'uuid';

export interface RunscConfig {
  platform: 'ptrace' | 'kvm' | 'systrap';
  sandbox: SandboxConfig;
  files: FilesConfig;
  network: NetworkConfig;
  strace: boolean;
  profile: any; // Seccomp profile
}

export interface SandboxConfig {
  allow_all_ports: boolean;
  allow_all_uris: boolean;
  enable_vfs: boolean;
  enable_net: boolean;
  enable_net_raw: boolean;
  enable_net_packet: boolean;
  enable_ioprio: boolean;
  enable_sched: boolean;
  enable_mlock: boolean;
  enable_cpu_mem_cgroup: boolean;
  enable_swap_accounting: boolean;
  cpu_cfs_quota: number;
  cpu_cfs_period: number;
  memory_limit: number;
  memory_swap_limit: number;
  pids_limit: number;
  oom_score_adj: number;
}

export interface FilesConfig {
  rootfs: 'readonly' | 'readwrite';
  tmpfs: TmpfsMount[];
  bind_mounts: BindMount[];
}

export interface TmpfsMount {
  path: string;
  size: number;
  mode: number;
  options: string[];
}

export interface BindMount {
  src: string;
  dst: string;
  readonly: boolean;
  recursive: boolean;
}

export interface NetworkConfig {
  network: 'none' | 'host' | 'bridge' | 'container';
  cidr?: string;
  gateway?: string;
}

export interface ContainerSpec {
  id: string;
  rootfs: string;
  config: RunscConfig;
  bundleDir: string;
  createdAt: string;
  status: 'created' | 'running' | 'stopped' | 'destroyed';
}

export interface RunscVersion {
  version: string;
  platform: string;
  commit: string;
}

export class GVisorIntegration {
  private runscPath: string;
  private rootDir: string;
  private containers: Map<string, ContainerSpec> = new Map();

  constructor(runscPath: string = 'runsc', rootDir: string = '/var/lib/crashlab/gvisor') {
    this.runscPath = runscPath;
    this.rootDir = rootDir;
  }

  /**
   * Initialize gVisor integration
   */
  async initialize(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    await this.verifyRunsc();
  }

  /**
   * Verify runsc is available
   */
  private async verifyRunsc(): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.runscPath, ['version'], { stdio: 'pipe' });
      let stdout = '';
      child.stdout?.on('data', (data) => { stdout += data.toString(); });
      child.on('close', (code) => {
        if (code === 0) {
          console.log(`gVisor version: ${stdout.trim()}`);
          resolve();
        } else {
          reject(new Error('runsc not available'));
        }
      });
      child.on('error', () => reject(new Error('runsc not found in PATH')));
    });
  }

  /**
   * Get runsc version
   */
  async getVersion(): Promise<RunscVersion> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.runscPath, ['version'], { stdio: 'pipe' });
      let stdout = '';
      child.stdout?.on('data', (data) => { stdout += data.toString(); });
      child.on('close', (code) => {
        if (code === 0) {
          const lines = stdout.trim().split('\n');
          resolve({
            version: lines[0]?.split(' ')[1] || 'unknown',
            platform: lines.find(l => l.includes('Platform'))?.split(': ')[1] || 'unknown',
            commit: lines.find(l => l.includes('Commit'))?.split(': ')[1] || 'unknown',
          });
        } else {
          reject(new Error('Failed to get version'));
        }
      });
      child.on('error', reject);
    });
  }

  /**
   * Create a container bundle
   */
  async createContainer(
    imagePath: string,
    config: Partial<RunscConfig> = {}
  ): Promise<ContainerSpec> {
    const containerId = uuidv4();
    const bundleDir = await mkdtemp(join(this.rootDir, `container-${containerId}-`));
    const rootfsDir = join(bundleDir, 'rootfs');

    // Extract rootfs from image (simplified - would use container image tools)
    await mkdir(rootfsDir, { recursive: true });

    // Create config.json for runsc
    const runscConfig: RunscConfig = {
      platform: 'ptrace',
      sandbox: {
        allow_all_ports: false,
        allow_all_uris: false,
        enable_vfs: true,
        enable_net: config.sandbox?.enable_net ?? false,
        enable_net_raw: false,
        enable_net_packet: false,
        enable_ioprio: false,
        enable_sched: true,
        enable_mlock: true,
        enable_cpu_mem_cgroup: true,
        enable_swap_accounting: true,
        cpu_cfs_quota: config.sandbox?.cpu_cfs_quota ?? 100000,
        cpu_cfs_period: config.sandbox?.cpu_cfs_period ?? 100000,
        memory_limit: config.sandbox?.memory_limit ?? 512 * 1024 * 1024,
        memory_swap_limit: config.sandbox?.memory_swap_limit ?? 512 * 1024 * 1024,
        pids_limit: config.sandbox?.pids_limit ?? 64,
        oom_score_adj: 1000,
      },
      files: {
        rootfs: config.files?.rootfs ?? 'readonly',
        tmpfs: config.files?.tmpfs ?? [
          { path: '/tmp', size: 100 * 1024 * 1024, mode: 0o1777, options: ['nosuid', 'nodev', 'noexec'] },
          { path: '/workspace', size: 500 * 1024 * 1024, mode: 0o755, options: ['nosuid', 'nodev'] },
        ],
        bind_mounts: config.files?.bind_mounts ?? [],
      },
      network: {
        network: config.network?.network ?? 'none',
        cidr: config.network?.cidr,
        gateway: config.network?.gateway,
      },
      strace: false,
      profile: config.profile,
    };

    await writeFile(join(bundleDir, 'config.json'), JSON.stringify(runscConfig, null, 2));

    // Create minimal OCI spec
    const ociSpec = {
      ociVersion: '1.0.2',
      process: {
        user: { uid: 1000, gid: 1000 },
        args: ['sleep', 'infinity'],
        env: ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'HOME=/workspace'],
        cwd: '/workspace',
        capabilities: { bounding: [], effective: [], inheritable: [], permitted: [], ambient: [] },
        rlimits: [
          { type: 'RLIMIT_NOFILE', hard: 256, soft: 256 },
          { type: 'RLIMIT_NPROC', hard: 64, soft: 64 },
        ],
        noNewPrivileges: true,
      },
      root: { path: 'rootfs', readonly: true },
      hostname: `sandbox-${containerId.slice(0, 8)}`,
      mounts: [
        { destination: '/proc', type: 'proc', source: 'proc', options: ['nosuid', 'noexec', 'nodev'] },
        { destination: '/dev', type: 'tmpfs', source: 'tmpfs', options: ['nosuid', 'strictatime', 'mode=755', 'size=65536k'] },
        { destination: '/dev/pts', type: 'devpts', source: 'devpts', options: ['nosuid', 'noexec', 'newinstance', 'ptmxmode=0666', 'mode=0620', 'gid=5'] },
        { destination: '/dev/shm', type: 'tmpfs', source: 'shm', options: ['nosuid', 'noexec', 'nodev', 'size=65536k'] },
        { destination: '/dev/mqueue', type: 'mqueue', source: 'mqueue', options: ['nosuid', 'noexec', 'nodev'] },
        { destination: '/sys', type: 'sysfs', source: 'sysfs', options: ['nosuid', 'noexec', 'nodev', 'ro'] },
        { destination: '/sys/fs/cgroup', type: 'cgroup', source: 'cgroup', options: ['nosuid', 'noexec', 'nodev', 'ro'] },
      ],
      linux: {
        namespaces: [
          { type: 'pid' },
          { type: 'network' },
          { type: 'ipc' },
          { type: 'uts' },
          { type: 'mount' },
          { type: 'cgroup' },
          { type: 'user' },
        ],
        maskedPaths: ['/proc/sys', '/proc/sysrq-trigger', '/proc/irq', '/proc/bus', '/sys/fs/selinux'],
        readonlyPaths: ['/proc', '/sys', '/dev', '/run'],
        seccomp: config.profile || { defaultAction: 'SCMP_ACT_ERRNO', architectures: ['SCMP_ARCH_X86_64'], syscalls: [] },
      },
    };

    await writeFile(join(bundleDir, 'config.json'), JSON.stringify(ociSpec, null, 2));

    const container: ContainerSpec = {
      id: containerId,
      rootfs: rootfsDir,
      config: runscConfig,
      bundleDir,
      createdAt: new Date().toISOString(),
      status: 'created',
    };

    this.containers.set(containerId, container);
    return container;
  }

  /**
   * Run a command in a container (ephemeral)
   */
  async run(
    image: string,
    command: string[],
    args: string[],
    options: RunOptions = {}
  ): Promise<RunResult> {
    const runId = uuidv4();
    const config = this.buildRunConfig(options);

    const runscArgs = [
      'run',
      '--platform', options.platform || 'ptrace',
      '--network', options.network || 'none',
      '--cpus', String(options.cpus || 1),
      '--memory', String(options.memory || 512 * 1024 * 1024),
      '--pids-limit', String(options.pidsLimit || 64),
      '--rootless',
    ];

    // Add bind mounts
    for (const mount of options.bindMounts || []) {
      runscArgs.push('--bind', `${mount.src}:${mount.dst}:${mount.readonly ? 'ro' : 'rw'}`);
    }

    // Add tmpfs mounts
    for (const tmpfs of options.tmpfsMounts || []) {
      runscArgs.push('--tmpfs', `${tmpfs.path}:size=${tmpfs.size},mode=${tmpfs.mode.toString(8)}`);
    }

    // Add environment
    for (const [key, value] of Object.entries(options.environment || {})) {
      runscArgs.push('--env', `${key}=${value}`);
    }

    // Add working directory and user
    runscArgs.push('--workdir', options.workingDir || '/workspace');
    runscArgs.push('--user', options.user || '1000:1000');

    // Container ID and command
    runscArgs.push(runId, ...command, ...args);

    return this.executeRunsc(runscArgs, options.timeout || 300000);
  }

  /**
   * Build runsc config from options
   */
  private buildRunConfig(options: RunOptions): RunscConfig {
    return {
      platform: options.platform || 'ptrace',
      sandbox: {
        allow_all_ports: false,
        allow_all_uris: false,
        enable_vfs: true,
        enable_net: options.network !== 'none',
        enable_net_raw: false,
        enable_net_packet: false,
        enable_ioprio: false,
        enable_sched: true,
        enable_mlock: true,
        enable_cpu_mem_cgroup: true,
        enable_swap_accounting: true,
        cpu_cfs_quota: Math.floor((options.cpus || 1) * 100000),
        cpu_cfs_period: 100000,
        memory_limit: options.memory || 512 * 1024 * 1024,
        memory_swap_limit: options.memory || 512 * 1024 * 1024,
        pids_limit: options.pidsLimit || 64,
        oom_score_adj: 1000,
      },
      files: {
        rootfs: 'readonly',
        tmpfs: options.tmpfsMounts || [
          { path: '/tmp', size: 100 * 1024 * 1024, mode: 0o1777, options: ['nosuid', 'nodev', 'noexec'] },
        ],
        bind_mounts: options.bindMounts || [],
      },
      network: {
        network: options.network || 'none',
      },
      strace: false,
      profile: options.seccompProfile,
    };
  }

  /**
   * Execute runsc command
   */
  private async executeRunsc(args: string[], timeoutMs: number): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.runscPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
      } as SpawnOptions);

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => { stdout += data.toString(); });
      child.stderr?.on('data', (data) => { stderr += data.toString(); });

      child.on('close', (code) => {
        resolve({
          exitCode: code || 0,
          stdout,
          stderr,
          success: code === 0,
        });
      });

      child.on('error', (error) => {
        if (error.message.includes('timeout') || error.message.includes('SIGKILL')) {
          resolve({
            exitCode: -1,
            stdout,
            stderr: stderr + '\nExecution timeout',
            success: false,
          });
        } else {
          reject(error);
        }
      });
    });
  }

  /**
   * List containers
   */
  async listContainers(): Promise<ContainerSpec[]> {
    return Array.from(this.containers.values());
  }

  /**
   * Get container info
   */
  getContainer(id: string): ContainerSpec | undefined {
    return this.containers.get(id);
  }

  /**
   * Delete container
   */
  async deleteContainer(id: string): Promise<boolean> {
    const container = this.containers.get(id);
    if (!container) return false;

    try {
      await rm(container.bundleDir, { recursive: true, force: true });
      this.containers.delete(id);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if gVisor supports KVM platform
   */
  async checkKvmSupport(): Promise<boolean> {
    try {
      const { stat } = await import('node:fs/promises');
      await stat('/dev/kvm');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get gVisor platform info
   */
  async getPlatformInfo(): Promise<{ platform: string; kvmSupported: boolean }> {
    const version = await this.getVersion();
    const kvmSupported = await this.checkKvmSupport();
    return { platform: version.platform, kvmSupported };
  }
}

export interface RunOptions {
  platform?: 'ptrace' | 'kvm' | 'systrap';
  network?: 'none' | 'host' | 'bridge';
  cpus?: number;
  memory?: number;
  pidsLimit?: number;
  bindMounts?: BindMount[];
  tmpfsMounts?: TmpfsMount[];
  environment?: Record<string, string>;
  workingDir?: string;
  user?: string;
  seccompProfile?: any;
  timeout?: number;
}

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  success: boolean;
}

/**
 * Create gVisor integration
 */
export function createGVisorIntegration(
  runscPath?: string,
  rootDir?: string
): GVisorIntegration {
  return new GVisorIntegration(
    runscPath || process.env.RUNSC_PATH || 'runsc',
    rootDir || process.env.GVISOR_ROOT_DIR || '/var/lib/crashlab/gvisor'
  );
}