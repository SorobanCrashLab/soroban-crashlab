/**
 * Sandbox Profile
 * 
 * Defines security profiles for sandboxed reproduction execution.
 * Includes seccomp profiles, capability drops, resource limits, and namespace isolation.
 */

export type SandboxRuntime = 'gvisor' | 'kata' | 'firecracker' | 'docker';

export type SeccompAction = 'allow' | 'errno' | 'kill' | 'log' | 'trace' | 'trap';

export interface SeccompRule {
  names: string[];
  action: SeccompAction;
  args?: SeccompArg[];
  comment?: string;
}

export interface SeccompArg {
  index: number;
  value: number;
  valueTwo?: number;
  op: 'eq' | 'neq' | 'lt' | 'le' | 'gt' | 'ge' | 'maskedEq';
}

export interface SeccompProfile {
  defaultAction: SeccompAction;
  architectures: string[];
  syscalls: SeccompRule[];
  flags?: string[];
}

export interface CapabilityConfig {
  drop: string[]; // Capabilities to drop (CAP_DROP=ALL means drop all)
  add: string[];  // Capabilities to add (rarely used)
  bounding: string[]; // Bounding set
  effective: string[]; // Effective set
  inheritable: string[]; // Inheritable set
  permitted: string[]; // Permitted set
}

export interface ResourceLimits {
  cpuQuota: number;      // CPU quota in microseconds per period
  cpuPeriod: number;     // CPU period in microseconds
  memoryLimitBytes: number; // Memory limit in bytes
  memorySwapLimitBytes: number; // Memory + swap limit
  pidsLimit: number;     // Maximum number of processes
  diskLimitBytes: number; // Disk/ephemeral storage limit
  networkBandwidthBps?: number; // Network bandwidth limit (bytes/sec)
  openFilesLimit: number; // Maximum open file descriptors
}

export interface NamespaceConfig {
  pid: boolean;
  network: boolean;
  mount: boolean;
  ipc: boolean;
  uts: boolean;
  user: boolean;
  cgroup: boolean;
}

export interface FilesystemConfig {
  readOnlyRootfs: boolean;
  tmpfsMounts: TmpfsMount[];
  bindMounts: BindMount[];
  maskPaths: string[];
  readonlyPaths: string[];
}

export interface TmpfsMount {
  path: string;
  sizeBytes: number;
  mode: number;
  options: string[];
}

export interface BindMount {
  source: string;
  target: string;
  readonly: boolean;
  recursive: boolean;
  propagation?: 'private' | 'shared' | 'slave' | 'unbindable' | 'rprivate' | 'rshared' | 'rslave' | 'runbindable';
}

export interface NetworkConfig {
  enabled: boolean;
  mode: 'none' | 'host' | 'bridge' | 'container' | 'custom';
  cidr?: string;
  gateway?: string;
  dns?: string[];
  dnsSearch?: string[];
  extraHosts?: Record<string, string>;
}

export interface SandboxProfileConfig {
  name: string;
  description: string;
  runtime: SandboxRuntime;
  seccomp: SeccompProfile;
  capabilities: CapabilityConfig;
  resources: ResourceLimits;
  namespaces: NamespaceConfig;
  filesystem: FilesystemConfig;
  network: NetworkConfig;
  environment: Record<string, string>;
  workingDir: string;
  user: string; // UID:GID or username
  group: string;
  supplementaryGroups: string[];
  timeoutSeconds: number;
  maxLogSizeBytes: number;
}

// Default seccomp profile - minimal syscalls for reproduction
export const DEFAULT_SECCOMP_PROFILE: SeccompProfile = {
  defaultAction: 'errno',
  architectures: ['SCMP_ARCH_X86_64', 'SCMP_ARCH_X86', 'SCMP_ARCH_X32', 'SCMP_ARCH_ARM64'],
  syscalls: [
    // Basic process management
    { names: ['exit', 'exit_group'], action: 'allow' },
    { names: ['read', 'write', 'pread64', 'pwrite64', 'readv', 'writev', 'preadv', 'pwritev'], action: 'allow' },
    { names: ['open', 'openat', 'close', 'close_range'], action: 'allow' },
    { names: ['lseek', 'llseek'], action: 'allow' },
    { names: ['stat', 'fstat', 'lstat', 'newfstatat', 'statx'], action: 'allow' },
    { names: ['access', 'faccessat', 'faccessat2'], action: 'allow' },
    
    // Memory management
    { names: ['mmap', 'mmap2', 'munmap', 'mprotect', 'madvise', 'mremap', 'mincore', 'mlock', 'munlock', 'mlock2', 'munlockall'], action: 'allow' },
    { names: ['brk', 'sbrk'], action: 'allow' },
    
    // Process info
    { names: ['getpid', 'getppid', 'getuid', 'geteuid', 'getgid', 'getegid', 'gettid', 'getrandom'], action: 'allow' },
    { names: ['times', 'clock_gettime', 'clock_getres', 'nanosleep', 'clock_nanosleep'], action: 'allow' },
    { names: ['sched_yield', 'sched_getaffinity', 'sched_setaffinity'], action: 'allow' },
    
    // File operations
    { names: ['fstatfs', 'statfs', 'fstatvfs', 'statvfs', 'sync', 'fsync', 'fdatasync', 'sync_file_range'], action: 'allow' },
    { names: ['fcntl', 'fcntl64', 'ioctl', 'ioctl32'], action: 'allow' },
    { names: ['dup', 'dup2', 'dup3', 'pipe', 'pipe2', 'eventfd', 'eventfd2', 'signalfd', 'signalfd4', 'timerfd_create', 'timerfd_settime', 'timerfd_gettime'], action: 'allow' },
    
    // Directory operations
    { names: ['mkdir', 'mkdirat', 'rmdir', 'unlink', 'unlinkat', 'rename', 'renameat', 'renameat2', 'link', 'linkat', 'symlink', 'symlinkat', 'readlink', 'readlinkat'], action: 'allow' },
    { names: ['getdents', 'getdents64', 'fdopendir'], action: 'allow' },
    { names: ['chdir', 'fchdir', 'getcwd', 'getwd'], action: 'allow' },
    
    // Permissions
    { names: ['chmod', 'fchmod', 'fchmodat', 'chown', 'fchown', 'lchown', 'fchownat', 'umask'], action: 'allow' },
    
    // Signals
    { names: ['rt_sigaction', 'rt_sigprocmask', 'rt_sigpending', 'rt_sigsuspend', 'rt_sigqueueinfo', 'rt_sigtimedwait', 'sigaltstack', 'kill', 'tkill', 'tgkill', 'restart_syscall'], action: 'allow' },
    
    // Time
    { names: ['time', 'gettimeofday', 'settimeofday', 'adjtimex', 'clock_settime'], action: 'allow' },
    
    // System info
    { names: ['uname', 'sysinfo', 'getrusage', 'getrlimit', 'setrlimit', 'prlimit64'], action: 'allow' },
    
    // Futex
    { names: ['futex', 'futex_time64', 'set_robust_list', 'get_robust_list'], action: 'allow' },
    
    // Threading
    { names: ['clone', 'clone3', 'set_tid_address', 'gettid', 'tgkill', 'exit', 'exit_group', 'wait4', 'waitid'], action: 'allow' },
    
    // Socket (minimal for local only)
    { names: ['socket', 'socketpair', 'bind', 'listen', 'accept', 'accept4', 'connect', 'getsockname', 'getpeername', 'sendto', 'recvfrom', 'sendmsg', 'recvmsg', 'shutdown', 'setsockopt', 'getsockopt'], action: 'errno' }, // Network disabled by default
    
    // Epoll
    { names: ['epoll_create', 'epoll_create1', 'epoll_ctl', 'epoll_wait', 'epoll_pwait', 'epoll_pwait2'], action: 'allow' },
    
    // Inotify
    { names: ['inotify_init', 'inotify_init1', 'inotify_add_watch', 'inotify_rm_watch'], action: 'allow' },
    
    // Mount (restricted)
    { names: ['mount', 'umount', 'umount2', 'pivot_root'], action: 'errno' },
    
    // Extended attributes
    { names: ['setxattr', 'lsetxattr', 'fsetxattr', 'getxattr', 'lgetxattr', 'fgetxattr', 'listxattr', 'llistxattr', 'flistxattr', 'removexattr', 'lremovexattr', 'fremovexattr'], action: 'allow' },
    
    // IPC (restricted)
    { names: ['shmget', 'shmctl', 'shmat', 'shmdt', 'semget', 'semctl', 'semop', 'semtimedop', 'msgget', 'msgctl', 'msgsnd', 'msgrcv'], action: 'errno' },
  ],
  flags: ['SECCOMP_FILTER_FLAG_TSYNC', 'SECCOMP_FILTER_FLAG_LOG'],
};

// Minimal capability config - drop all
export const DEFAULT_CAPABILITY_CONFIG: CapabilityConfig = {
  drop: ['ALL'],
  add: [],
  bounding: [],
  effective: [],
  inheritable: [],
  permitted: [],
};

// Default resource limits
export const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  cpuQuota: 100000, // 100ms per 100ms period = 1 CPU
  cpuPeriod: 100000,
  memoryLimitBytes: 512 * 1024 * 1024, // 512MB
  memorySwapLimitBytes: 512 * 1024 * 1024, // No swap
  pidsLimit: 64,
  diskLimitBytes: 1024 * 1024 * 1024, // 1GB ephemeral
  openFilesLimit: 256,
};

// Default namespace config - isolated
export const DEFAULT_NAMESPACE_CONFIG: NamespaceConfig = {
  pid: true,
  network: true,
  mount: true,
  ipc: true,
  uts: true,
  user: true,
  cgroup: true,
};

// Default filesystem config - read-only rootfs
export const DEFAULT_FILESYSTEM_CONFIG: FilesystemConfig = {
  readOnlyRootfs: true,
  tmpfsMounts: [
    { path: '/tmp', sizeBytes: 100 * 1024 * 1024, mode: 0o1777, options: ['nosuid', 'nodev', 'noexec'] },
    { path: '/var/tmp', sizeBytes: 50 * 1024 * 1024, mode: 0o1777, options: ['nosuid', 'nodev', 'noexec'] },
    { path: '/workspace', sizeBytes: 500 * 1024 * 1024, mode: 0o755, options: ['nosuid', 'nodev'] },
  ],
  bindMounts: [],
  maskPaths: ['/proc/sys', '/proc/sysrq-trigger', '/proc/irq', '/proc/bus', '/sys/fs/selinux'],
  readonlyPaths: ['/proc', '/sys', '/dev', '/run'],
};

// Default network config - disabled
export const DEFAULT_NETWORK_CONFIG: NetworkConfig = {
  enabled: false,
  mode: 'none',
};

// Default sandbox profile for reproduction
export const DEFAULT_REPRODUCTION_PROFILE: SandboxProfileConfig = {
  name: 'reproduction-standard',
  description: 'Standard sandbox profile for crash reproduction',
  runtime: 'gvisor',
  seccomp: DEFAULT_SECCOMP_PROFILE,
  capabilities: DEFAULT_CAPABILITY_CONFIG,
  resources: DEFAULT_RESOURCE_LIMITS,
  namespaces: DEFAULT_NAMESPACE_CONFIG,
  filesystem: DEFAULT_FILESYSTEM_CONFIG,
  network: DEFAULT_NETWORK_CONFIG,
  environment: {
    PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    HOME: '/workspace',
    USER: 'sandbox',
    SHELL: '/bin/bash',
    TERM: 'xterm',
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
  },
  workingDir: '/workspace',
  user: '1000:1000',
  group: '1000',
  supplementaryGroups: [],
  timeoutSeconds: 300,
  maxLogSizeBytes: 10 * 1024 * 1024, // 10MB
};

// Strict profile for untrusted reproducers
export const STRICT_REPRODUCTION_PROFILE: SandboxProfileConfig = {
  ...DEFAULT_REPRODUCTION_PROFILE,
  name: 'reproduction-strict',
  description: 'Strict sandbox profile for untrusted reproducer execution',
  resources: {
    ...DEFAULT_RESOURCE_LIMITS,
    cpuQuota: 50000, // 0.5 CPU
    memoryLimitBytes: 256 * 1024 * 1024, // 256MB
    pidsLimit: 32,
    diskLimitBytes: 512 * 1024 * 1024, // 512MB
    openFilesLimit: 128,
  },
  seccomp: {
    ...DEFAULT_SECCOMP_PROFILE,
    defaultAction: 'kill', // Kill on any non-allowed syscall
  },
  filesystem: {
    ...DEFAULT_FILESYSTEM_CONFIG,
    tmpfsMounts: [
      { path: '/tmp', sizeBytes: 50 * 1024 * 1024, mode: 0o1777, options: ['nosuid', 'nodev', 'noexec'] },
      { path: '/workspace', sizeBytes: 100 * 1024 * 1024, mode: 0o755, options: ['nosuid', 'nodev'] },
    ],
  },
  timeoutSeconds: 60,
};

// Profile for trusted/internal reproducers
export const TRUSTED_REPRODUCTION_PROFILE: SandboxProfileConfig = {
  ...DEFAULT_REPRODUCTION_PROFILE,
  name: 'reproduction-trusted',
  description: 'Relaxed sandbox profile for trusted internal reproducers',
  resources: {
    ...DEFAULT_RESOURCE_LIMITS,
    cpuQuota: 200000, // 2 CPUs
    memoryLimitBytes: 2 * 1024 * 1024 * 1024, // 2GB
    pidsLimit: 128,
    diskLimitBytes: 2 * 1024 * 1024 * 1024, // 2GB
  },
  capabilities: {
    ...DEFAULT_CAPABILITY_CONFIG,
    add: ['CAP_DAC_OVERRIDE', 'CAP_SYS_ADMIN'], // For debugging
  },
  seccomp: {
    ...DEFAULT_SECCOMP_PROFILE,
    defaultAction: 'allow', // Allow unknown syscalls (with logging)
    syscalls: [
      ...DEFAULT_SECCOMP_PROFILE.syscalls,
      // Allow more syscalls for debugging
      { names: ['ptrace', 'process_vm_readv', 'process_vm_writev'], action: 'allow' },
    ],
  },
  timeoutSeconds: 600,
};

/**
 * Get profile by name
 */
export function getProfile(name: string): SandboxProfileConfig {
  switch (name) {
    case 'strict':
      return STRICT_REPRODUCTION_PROFILE;
    case 'trusted':
      return TRUSTED_REPRODUCTION_PROFILE;
    case 'standard':
    default:
      return DEFAULT_REPRODUCTION_PROFILE;
  }
}

/**
 * Convert profile to gVisor runsc config
 */
export function profileToGVisorConfig(profile: SandboxProfileConfig): object {
  return {
    platform: 'ptrace', // or 'kvm' for hardware virtualization
    sandbox: {
      allow_all_ports: false,
      allow_all_uris: false,
      enable_vfs: true,
      enable_net: profile.network.enabled,
      enable_net_raw: false,
      enable_net_packet: false,
      enable_ioprio: false,
      enable_sched: true,
      enable_mlock: true,
      enable_cpu_mem_cgroup: true,
      enable_swap_accounting: true,
      cpu_cfs_quota: profile.resources.cpuQuota,
      cpu_cfs_period: profile.resources.cpuPeriod,
      memory_limit: profile.resources.memoryLimitBytes,
      memory_swap_limit: profile.resources.memorySwapLimitBytes,
      pids_limit: profile.resources.pidsLimit,
      oom_score_adj: 1000,
    },
    files: {
      rootfs: profile.filesystem.readOnlyRootfs ? 'readonly' : 'readwrite',
      tmpfs: profile.filesystem.tmpfsMounts.map(m => ({
        path: m.path,
        size: m.sizeBytes,
        mode: m.mode,
        options: m.options,
      })),
      bind_mounts: profile.filesystem.bindMounts.map(m => ({
        src: m.source,
        dst: m.target,
        readonly: m.readonly,
        recursive: m.recursive,
      })),
    },
    network: {
      network: profile.network.mode,
      cidr: profile.network.cidr,
      gateway: profile.network.gateway,
    },
    strace: false,
    profile: profile.seccomp,
  };
}

/**
 * Convert profile to Kata Containers config
 */
export function profileToKataConfig(profile: SandboxProfileConfig): object {
  return {
    hypervisor: {
      path: '/usr/bin/qemu-system-x86_64',
      kernel: '/var/lib/kata/kernel',
      initrd: '/var/lib/kata/initrd',
      firmware: '/var/lib/kata/firmware',
      machine_type: 'q35',
      kernel_params: 'agent.kata=1 console=ttyS0 panic=1',
      default_vcpus: Math.ceil(profile.resources.cpuQuota / profile.resources.cpuPeriod),
      default_memory: Math.ceil(profile.resources.memoryLimitBytes / 1024 / 1024),
      default_maxvcpus: Math.ceil(profile.resources.cpuQuota / profile.resources.cpuPeriod) * 2,
    },
    runtime: {
      enable_cpu_hotplug: false,
      enable_memory_hotplug: false,
      enable_blk_hotplug: false,
      enable_virtiofs: true,
      enable_vsock: false,
      cgroups_version: 'v2',
    },
    container: {
      cgroup_name_prefix: 'kata',
      use_hypervisor_cgroup: true,
    },
    seccomp: profile.seccomp,
    capabilities: profile.capabilities,
    resources: profile.resources,
  };
}