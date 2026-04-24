/**
 * Storage Backend Integration for Artifacts
 *
 * Provides abstraction layer for artifact persistence with:
 * - Multiple backend implementations (memory, indexed-db, file-based)
 * - Configuration management
 * - Error handling with observable failures
 * - Deterministic setup for testing
 */

/**
 * Artifact interface - mirrors web component artifact type
 */
export interface Artifact {
  id: string;
  name: string;
  createdAt: string;
  sizeBytes?: number;
  mimeType?: string;
  url?: string;
}

/**
 * Errors from storage backend operations
 */
export enum StorageErrorCode {
  NotFound = 'NOT_FOUND',
  PermissionDenied = 'PERMISSION_DENIED',
  QuotaExceeded = 'QUOTA_EXCEEDED',
  ConnectionFailed = 'CONNECTION_FAILED',
  InvalidConfiguration = 'INVALID_CONFIGURATION',
  SerializationError = 'SERIALIZATION_ERROR',
  UnknownError = 'UNKNOWN_ERROR',
}

export class StorageError extends Error {
  constructor(
    public code: StorageErrorCode,
    message: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

/**
 * Core storage backend interface
 */
export interface StorageBackend {
  /**
   * Upload an artifact to storage
   */
  upload(file: File): Promise<Artifact>;

  /**
   * Download artifact content
   */
  download(id: string): Promise<Blob>;

  /**
   * List all stored artifacts
   */
  list(): Promise<Artifact[]>;

  /**
   * Get single artifact metadata
   */
  get(id: string): Promise<Artifact>;

  /**
   * Delete an artifact
   */
  delete(id: string): Promise<void>;

  /**
   * Check if artifact exists
   */
  exists(id: string): Promise<boolean>;

  /**
   * Get storage configuration for inspection
   */
  getConfiguration(): StorageConfiguration;

  /**
   * Verify backend connectivity and permissions
   */
  verify(): Promise<boolean>;

  /**
   * Get backend statistics (used space, artifact count)
   */
  getStats(): Promise<StorageStats>;
}

/**
 * Configuration for storage backend
 */
export interface StorageConfiguration {
  type: 'memory' | 'indexed-db' | 'file-system' | 'cloud';
  name: string;
  description: string;
  readonly: boolean;
  maxSizeBytes: number;
  quotaWarningPercent: number;
}

/**
 * Storage statistics
 */
export interface StorageStats {
  totalArtifacts: number;
  usedBytes: number;
  maxBytes: number;
  quotaPercentUsed: number;
}

/**
 * In-memory storage backend (for testing and development)
 */
export class MemoryStorageBackend implements StorageBackend {
  private artifacts: Map<string, { artifact: Artifact; content: Blob }> = new Map();
  private maxSizeBytes: number = 100 * 1024 * 1024; // 100MB default
  private usedBytes: number = 0;

  constructor(maxSizeBytes: number = 100 * 1024 * 1024) {
    this.maxSizeBytes = maxSizeBytes;
  }

  async upload(file: File): Promise<Artifact> {
    if (this.usedBytes + file.size > this.maxSizeBytes) {
      throw new StorageError(
        StorageErrorCode.QuotaExceeded,
        `Storage quota exceeded: ${this.usedBytes + file.size} > ${this.maxSizeBytes}`
      );
    }

    const id = `art-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const artifact: Artifact = {
      id,
      name: file.name,
      createdAt: new Date().toISOString(),
      sizeBytes: file.size,
      mimeType: file.type || 'application/octet-stream',
    };

    this.artifacts.set(id, { artifact, content: file });
    this.usedBytes += file.size;

    return artifact;
  }

  async download(id: string): Promise<Blob> {
    const entry = this.artifacts.get(id);
    if (!entry) {
      throw new StorageError(
        StorageErrorCode.NotFound,
        `Artifact ${id} not found in memory storage`
      );
    }
    return entry.content;
  }

  async list(): Promise<Artifact[]> {
    return Array.from(this.artifacts.values())
      .map(e => e.artifact)
      .sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA; // Most recent first
      });
  }

  async get(id: string): Promise<Artifact> {
    const entry = this.artifacts.get(id);
    if (!entry) {
      throw new StorageError(
        StorageErrorCode.NotFound,
        `Artifact ${id} not found`
      );
    }
    return entry.artifact;
  }

  async delete(id: string): Promise<void> {
    const entry = this.artifacts.get(id);
    if (!entry) {
      throw new StorageError(
        StorageErrorCode.NotFound,
        `Cannot delete artifact ${id}: not found`
      );
    }
    this.usedBytes -= entry.artifact.sizeBytes || 0;
    this.artifacts.delete(id);
  }

  async exists(id: string): Promise<boolean> {
    return this.artifacts.has(id);
  }

  getConfiguration(): StorageConfiguration {
    return {
      type: 'memory',
      name: 'Memory Storage (Testing)',
      description: 'In-memory storage for testing and development',
      readonly: false,
      maxSizeBytes: this.maxSizeBytes,
      quotaWarningPercent: 80,
    };
  }

  async verify(): Promise<boolean> {
    return true; // Memory storage is always available
  }

  async getStats(): Promise<StorageStats> {
    return {
      totalArtifacts: this.artifacts.size,
      usedBytes: this.usedBytes,
      maxBytes: this.maxSizeBytes,
      quotaPercentUsed: (this.usedBytes / this.maxSizeBytes) * 100,
    };
  }
}

/**
 * IndexedDB storage backend (for browser persistence)
 * Provides persistent client-side storage using IndexedDB
 */
export class IndexedDBStorageBackend implements StorageBackend {
  private dbName = 'CrashLabArtifacts';
  private storeName = 'artifacts';
  private maxSizeBytes: number = 50 * 1024 * 1024; // 50MB default
  private db: IDBDatabase | null = null;

  constructor(maxSizeBytes: number = 50 * 1024 * 1024) {
    this.maxSizeBytes = maxSizeBytes;
  }

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => {
        reject(
          new StorageError(
            StorageErrorCode.ConnectionFailed,
            'Failed to open IndexedDB'
          )
        );
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };
    });
  }

  async upload(file: File): Promise<Artifact> {
    const db = await this.getDB();
    const stats = await this.getStats();

    if (stats.usedBytes + file.size > this.maxSizeBytes) {
      throw new StorageError(
        StorageErrorCode.QuotaExceeded,
        `Storage quota exceeded: ${stats.usedBytes + file.size} > ${this.maxSizeBytes}`
      );
    }

    const id = `art-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const artifact: Artifact = {
      id,
      name: file.name,
      createdAt: new Date().toISOString(),
      sizeBytes: file.size,
      mimeType: file.type || 'application/octet-stream',
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction([this.storeName], 'readwrite');
      const store = tx.objectStore(this.storeName);

      file.arrayBuffer().then(buffer => {
        const entry = {
          ...artifact,
          content: new Blob([buffer], { type: file.type }),
        };

        const request = store.put(entry);

        request.onerror = () => {
          reject(
            new StorageError(
              StorageErrorCode.UnknownError,
              'Failed to store artifact in IndexedDB'
            )
          );
        };

        request.onsuccess = () => {
          resolve(artifact);
        };
      });
    });
  }

  async download(id: string): Promise<Blob> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([this.storeName], 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.get(id);

      request.onerror = () => {
        reject(
          new StorageError(
            StorageErrorCode.NotFound,
            `Artifact ${id} not found in IndexedDB`
          )
        );
      };

      request.onsuccess = () => {
        if (!request.result) {
          reject(
            new StorageError(
              StorageErrorCode.NotFound,
              `Artifact ${id} not found`
            )
          );
        } else {
          resolve(request.result.content);
        }
      };
    });
  }

  async list(): Promise<Artifact[]> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([this.storeName], 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.getAll();

      request.onerror = () => {
        reject(
          new StorageError(
            StorageErrorCode.UnknownError,
            'Failed to list artifacts from IndexedDB'
          )
        );
      };

      request.onsuccess = () => {
        const artifacts = request.result
          .map((entry: any) => ({
            id: entry.id,
            name: entry.name,
            createdAt: entry.createdAt,
            sizeBytes: entry.sizeBytes,
            mimeType: entry.mimeType,
          }))
          .sort((a, b) => {
            const dateA = new Date(a.createdAt).getTime();
            const dateB = new Date(b.createdAt).getTime();
            return dateB - dateA;
          });

        resolve(artifacts);
      };
    });
  }

  async get(id: string): Promise<Artifact> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([this.storeName], 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.get(id);

      request.onerror = () => {
        reject(
          new StorageError(
            StorageErrorCode.NotFound,
            `Artifact ${id} not found`
          )
        );
      };

      request.onsuccess = () => {
        if (!request.result) {
          reject(
            new StorageError(
              StorageErrorCode.NotFound,
              `Artifact ${id} not found`
            )
          );
        } else {
          const entry = request.result;
          resolve({
            id: entry.id,
            name: entry.name,
            createdAt: entry.createdAt,
            sizeBytes: entry.sizeBytes,
            mimeType: entry.mimeType,
          });
        }
      };
    });
  }

  async delete(id: string): Promise<void> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([this.storeName], 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.delete(id);

      request.onerror = () => {
        reject(
          new StorageError(
            StorageErrorCode.UnknownError,
            `Failed to delete artifact ${id}`
          )
        );
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  }

  async exists(id: string): Promise<boolean> {
    try {
      await this.get(id);
      return true;
    } catch {
      return false;
    }
  }

  getConfiguration(): StorageConfiguration {
    return {
      type: 'indexed-db',
      name: 'IndexedDB Storage (Browser)',
      description: 'Persistent client-side storage using browser IndexedDB',
      readonly: false,
      maxSizeBytes: this.maxSizeBytes,
      quotaWarningPercent: 80,
    };
  }

  async verify(): Promise<boolean> {
    try {
      const db = await this.getDB();
      const tx = db.transaction([this.storeName], 'readonly');
      return !!tx;
    } catch {
      return false;
    }
  }

  async getStats(): Promise<StorageStats> {
    const artifacts = await this.list();
    const usedBytes = artifacts.reduce(
      (sum, a) => sum + (a.sizeBytes || 0),
      0
    );

    return {
      totalArtifacts: artifacts.length,
      usedBytes,
      maxBytes: this.maxSizeBytes,
      quotaPercentUsed: (usedBytes / this.maxSizeBytes) * 100,
    };
  }
}

/**
 * Storage Backend Manager
 * Handles backend selection, configuration, and provides unified interface
 */
export class StorageBackendManager {
  private backend: StorageBackend;
  private backends: Map<string, StorageBackend> = new Map();
  private operationLog: Array<{
    timestamp: Date;
    operation: string;
    success: boolean;
    error?: string;
  }> = [];

  constructor(backend: StorageBackend = new MemoryStorageBackend()) {
    this.backend = backend;
    this.backends.set('memory', new MemoryStorageBackend());
    this.backends.set('indexed-db', new IndexedDBStorageBackend());
  }

  /**
   * Switch to a different backend
   */
  switchBackend(backendType: string): boolean {
    const backend = this.backends.get(backendType);
    if (!backend) {
      this.logOperation(backendType, false, 'Backend not found');
      return false;
    }
    this.backend = backend;
    this.logOperation(`switch:${backendType}`, true);
    return true;
  }

  /**
   * Get list of available backends
   */
  getAvailableBackends(): string[] {
    return Array.from(this.backends.keys());
  }

  /**
   * Get current backend configuration
   */
  getCurrentConfiguration(): StorageConfiguration {
    return this.backend.getConfiguration();
  }

  /**
   * Proxy method: upload artifact
   */
  async upload(file: File): Promise<Artifact> {
    try {
      const result = await this.backend.upload(file);
      this.logOperation('upload', true);
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logOperation('upload', false, msg);
      throw error;
    }
  }

  /**
   * Proxy method: download artifact
   */
  async download(id: string): Promise<Blob> {
    try {
      const result = await this.backend.download(id);
      this.logOperation('download', true);
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logOperation('download', false, msg);
      throw error;
    }
  }

  /**
   * Proxy method: list artifacts
   */
  async list(): Promise<Artifact[]> {
    try {
      const result = await this.backend.list();
      this.logOperation('list', true);
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logOperation('list', false, msg);
      throw error;
    }
  }

  /**
   * Proxy method: get single artifact
   */
  async get(id: string): Promise<Artifact> {
    try {
      const result = await this.backend.get(id);
      this.logOperation('get', true);
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logOperation('get', false, msg);
      throw error;
    }
  }

  /**
   * Proxy method: delete artifact
   */
  async delete(id: string): Promise<void> {
    try {
      await this.backend.delete(id);
      this.logOperation('delete', true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logOperation('delete', false, msg);
      throw error;
    }
  }

  /**
   * Proxy method: check existence
   */
  async exists(id: string): Promise<boolean> {
    try {
      const result = await this.backend.exists(id);
      this.logOperation('exists', true);
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logOperation('exists', false, msg);
      throw error;
    }
  }

  /**
   * Proxy method: verify backend
   */
  async verify(): Promise<boolean> {
    try {
      const result = await this.backend.verify();
      this.logOperation('verify', result);
      return result;
    } catch {
      this.logOperation('verify', false);
      return false;
    }
  }

  /**
   * Proxy method: get stats
   */
  async getStats(): Promise<StorageStats> {
    try {
      const result = await this.backend.getStats();
      this.logOperation('getStats', true);
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logOperation('getStats', false, msg);
      throw error;
    }
  }

  /**
   * Get operation log (for observability)
   */
  getOperationLog(limit?: number): typeof this.operationLog {
    if (!limit) return this.operationLog;
    return this.operationLog.slice(-limit);
  }

  /**
   * Clear operation log
   */
  clearOperationLog(): void {
    this.operationLog = [];
  }

  private logOperation(
    operation: string,
    success: boolean,
    error?: string
  ): void {
    this.operationLog.push({
      timestamp: new Date(),
      operation,
      success,
      error,
    });

    // Keep log size bounded
    if (this.operationLog.length > 1000) {
      this.operationLog.shift();
    }
  }
}

/**
 * Global storage backend manager instance
 */
export let globalStorageManager: StorageBackendManager =
  new StorageBackendManager();

/**
 * Initialize global storage manager with specific backend
 */
export function initializeStorageBackend(
  backendType: 'memory' | 'indexed-db' = 'memory'
): StorageBackendManager {
  const backend =
    backendType === 'indexed-db'
      ? new IndexedDBStorageBackend()
      : new MemoryStorageBackend();

  globalStorageManager = new StorageBackendManager(backend);
  return globalStorageManager;
}
