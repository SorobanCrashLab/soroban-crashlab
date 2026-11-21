/**
 * Sandbox Hooks
 * 
 * React hooks for sandboxed reproduction execution UI.
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { SandboxManager, SandboxContainer, ExecutionRequest, ExecutionResult, SandboxProfileConfig } from '../sandbox/SandboxManager.js';
import { ReproductionExecutor, ReproductionRequest, ReproductionResult } from '../sandbox/ReproductionExecutor.js';
import { ReproducerPackage } from '../verification/ReproducerVerifier.js';

export interface UseSandboxOptions {
  autoInitialize?: boolean;
}

export interface UseSandboxReturn {
  // Sandbox management
  createContainer: (profileName?: string) => Promise<SandboxContainer>;
  getContainer: (id: string) => SandboxContainer | undefined;
  listContainers: () => SandboxContainer[];
  stopContainer: (id: string) => Promise<void>;
  cleanup: () => Promise<void>;
  
  // Execution
  execute: (request: ExecutionRequest) => Promise<ExecutionResult>;
  executeReproduction: (request: ReproductionRequest) => Promise<ReproductionResult>;
  
  // Profiles
  getProfile: (name: string) => Promise<SandboxProfileConfig>;
  listProfiles: () => string[];
  
  // State
  containers: SandboxContainer[];
  activeContainer: SandboxContainer | null;
  activeExecution: ExecutionResult | null;
  isLoading: boolean;
  isExecuting: boolean;
  error: Error | null;
  
  // Actions
  refreshContainers: () => Promise<void>;
  selectContainer: (container: SandboxContainer | null) => void;
  initialize: () => Promise<void>;
}

export function useSandbox(
  sandboxManager: SandboxManager,
  reproductionExecutor: ReproductionExecutor | null,
  options: UseSandboxOptions = {}
): UseSandboxReturn {
  const [containers, setContainers] = useState<SandboxContainer[]>([]);
  const [activeContainer, setActiveContainer] = useState<SandboxContainer | null>(null);
  const [activeExecution, setActiveExecution] = useState<ExecutionResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [initialized, setInitialized] = useState(false);

  const initialize = useCallback(async () => {
    if (initialized) return;
    setIsLoading(true);
    setError(null);
    
    try {
      await sandboxManager.initialize();
      setInitialized(true);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Sandbox initialization failed'));
    } finally {
      setIsLoading(false);
    }
  }, [sandboxManager, initialized]);

  const refreshContainers = useCallback(async () => {
    setError(null);
    try {
      const list = sandboxManager.listContainers();
      setContainers(list);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to refresh containers'));
    }
  }, [sandboxManager]);

  const createContainer = useCallback(async (profileName?: string) => {
    setError(null);
    try {
      const container = await sandboxManager.createContainer(profileName);
      setContainers(prev => [...prev, container]);
      return container;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to create container'));
      throw err;
    }
  }, [sandboxManager]);

  const getContainer = useCallback((id: string) => {
    return sandboxManager.getContainer(id);
  }, [sandboxManager]);

  const listContainers = useCallback(() => {
    return sandboxManager.listContainers();
  }, [sandboxManager]);

  const stopContainer = useCallback(async (id: string) => {
    setError(null);
    try {
      await sandboxManager.stopContainer(id);
      setContainers(prev => prev.filter(c => c.id !== id));
      if (activeContainer?.id === id) setActiveContainer(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to stop container'));
      throw err;
    }
  }, [sandboxManager, activeContainer]);

  const cleanup = useCallback(async () => {
    setError(null);
    try {
      await sandboxManager.cleanup();
      setContainers([]);
      setActiveContainer(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Cleanup failed'));
      throw err;
    }
  }, [sandboxManager]);

  const execute = useCallback(async (request: ExecutionRequest) => {
    setIsExecuting(true);
    setError(null);
    
    try {
      const result = await sandboxManager.execute(request);
      setActiveExecution(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Execution failed'));
      throw err;
    } finally {
      setIsExecuting(false);
    }
  }, [sandboxManager]);

  const executeReproduction = useCallback(async (request: ReproductionRequest) => {
    if (!reproductionExecutor) {
      throw new Error('Reproduction executor not available');
    }
    
    setIsExecuting(true);
    setError(null);
    
    try {
      const result = await reproductionExecutor.execute(request);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Reproduction execution failed'));
      throw err;
    } finally {
      setIsExecuting(false);
    }
  }, [reproductionExecutor]);

  const getProfile = useCallback(async (name: string) => {
    return sandboxManager.getProfile(name);
  }, [sandboxManager]);

  const listProfiles = useCallback(() => {
    return ['standard', 'strict', 'trusted'];
  }, []);

  const selectContainer = useCallback((container: SandboxContainer | null) => {
    setActiveContainer(container);
  }, []);

  useEffect(() => {
    if (options.autoInitialize) {
      initialize();
    }
  }, [options.autoInitialize, initialize]);

  useEffect(() => {
    if (initialized) {
      refreshContainers();
    }
  }, [initialized, refreshContainers]);

  return {
    // Sandbox management
    createContainer,
    getContainer,
    listContainers,
    stopContainer,
    cleanup,
    
    // Execution
    execute,
    executeReproduction,
    
    // Profiles
    getProfile,
    listProfiles,
    
    // State
    containers,
    activeContainer,
    activeExecution,
    isLoading,
    isExecuting,
    error,
    
    // Actions
    refreshContainers,
    selectContainer,
    initialize,
  };
}

export const CONTAINER_STATUS_LABELS: Record<SandboxContainer['status'], string> = {
  creating: 'Creating',
  running: 'Running',
  stopped: 'Stopped',
  failed: 'Failed',
  cleanup: 'Cleaning Up',
};

export const CONTAINER_STATUS_COLORS: Record<SandboxContainer['status'], string> = {
  creating: 'blue',
  running: 'green',
  stopped: 'gray',
  failed: 'red',
  cleanup: 'yellow',
};

export const RUNTIME_LABELS: Record<string, string> = {
  gvisor: 'gVisor (ptrace/KVM)',
  kata: 'Kata Containers',
  docker: 'Docker (runc)',
  firecracker: 'Firecracker',
};

export const PROFILE_LABELS: Record<string, string> = {
  standard: 'Standard (Balanced)',
  strict: 'Strict (Maximum Isolation)',
  trusted: 'Trusted (Relaxed)',
};

export const PROFILE_DESCRIPTIONS: Record<string, string> = {
  standard: 'Default profile with balanced security and compatibility. Read-only rootfs, no network, CPU/memory limits.',
  strict: 'Maximum isolation profile. Kill on syscall violations, minimal resources, no capabilities.',
  trusted: 'Relaxed profile for trusted internal reproducers. More resources, debugging capabilities enabled.',
};