/**
 * ClamAV Client
 * 
 * Communicates with ClamAV daemon (clamd) via TCP or Unix socket
 * for malware scanning of artifact uploads.
 */

import { createConnection, Socket } from 'node:net';
import { readFile } from 'node:fs/promises';
import { ScanResult, ScanVerdict, ScanMatch, ScannerConfig, DEFAULT_SCANNER_CONFIG } from './ScanResult.js';

export interface ClamAVResponse {
  status: 'OK' | 'FOUND' | 'ERROR' | 'TIMEOUT';
  message: string;
  signature?: string;
}

export class ClamAVClient {
  private config: ScannerConfig;
  private socket: Socket | null = null;
  private connected = false;

  constructor(config: Partial<ScannerConfig> = {}) {
    this.config = { ...DEFAULT_SCANNER_CONFIG, ...config };
  }

  /**
   * Connect to ClamAV daemon
   */
  async connect(): Promise<void> {
    if (this.connected && this.socket) return;

    return new Promise((resolve, reject) => {
      const useSocket = this.config.clamdSocket && !this.config.clamdHost;
      
      this.socket = useSocket
        ? createConnection(this.config.clamdSocket!)
        : createConnection({ host: this.config.clamdHost!, port: this.config.clamdPort! });

      this.socket.setTimeout(this.config.timeoutMs);

      this.socket.on('connect', () => {
        this.connected = true;
        resolve();
      });

      this.socket.on('error', (error) => {
        this.connected = false;
        reject(new Error(`ClamAV connection failed: ${error.message}`));
      });

      this.socket.on('timeout', () => {
        this.connected = false;
        this.socket?.destroy();
        reject(new Error('ClamAV connection timeout'));
      });

      this.socket.on('close', () => {
        this.connected = false;
      });
    });
  }

  /**
   * Disconnect from ClamAV daemon
   */
  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
      this.connected = false;
    }
  }

  /**
   * Scan a buffer using ClamAV's INSTREAM command
   */
  async scanBuffer(buffer: Buffer): Promise<ScanResult> {
    const startTime = Date.now();
    
    try {
      await this.connect();
      
      // Send INSTREAM command
      const response = await this.sendInstreamCommand(buffer);
      
      const durationMs = Date.now() - startTime;
      
      return this.parseResponse(response, durationMs, buffer.length);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      return {
        verdict: 'error',
        scanner: 'clamav',
        timestamp: new Date().toISOString(),
        durationMs,
        matches: [],
        error: error instanceof Error ? error.message : 'Unknown ClamAV error',
        scannedBytes: buffer.length,
      };
    }
  }

  /**
   * Scan a file using ClamAV's SCAN command (path-based)
   */
  async scanFile(filePath: string): Promise<ScanResult> {
    const startTime = Date.now();
    
    try {
      await this.connect();
      
      const response = await this.sendScanCommand(filePath);
      
      const durationMs = Date.now() - startTime;
      const stats = await import('node:fs/promises').then(fs => fs.stat(filePath));
      
      return this.parseResponse(response, durationMs, stats.size);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      return {
        verdict: 'error',
        scanner: 'clamav',
        timestamp: new Date().toISOString(),
        durationMs,
        matches: [],
        error: error instanceof Error ? error.message : 'Unknown ClamAV error',
        scannedBytes: 0,
      };
    }
  }

  /**
   * Send INSTREAM command for buffer scanning
   */
  private async sendInstreamCommand(buffer: Buffer): Promise<ClamAVResponse> {
    if (!this.socket) throw new Error('Not connected to ClamAV');

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let responseReceived = false;

      const timeout = setTimeout(() => {
        if (!responseReceived) {
          responseReceived = true;
          reject(new Error('ClamAV scan timeout'));
        }
      }, this.config.timeoutMs);

      const onData = (data: Buffer) => {
        chunks.push(data);
        const response = Buffer.concat(chunks).toString('ascii');
        
        // ClamAV responses end with \n
        if (response.endsWith('\n')) {
          responseReceived = true;
          clearTimeout(timeout);
          this.socket?.off('data', onData);
          
          try {
            resolve(this.parseInstreamResponse(response.trim()));
          } catch (e) {
            reject(e);
          }
        }
      };

      this.socket.on('data', onData);

      // Send INSTREAM command
      // Format: "INSTREAM\n" followed by chunks of [length][data] and ending with [0]
      this.socket.write('zINSTREAM\0'); // z = compressed, INSTREAM command
      
      // Send data in chunks (max 1024 bytes per chunk for ClamAV)
      const chunkSize = 1024;
      for (let i = 0; i < buffer.length; i += chunkSize) {
        const chunk = buffer.subarray(i, Math.min(i + chunkSize, buffer.length));
        const length = Buffer.alloc(4);
        length.writeUInt32BE(chunk.length, 0);
        this.socket.write(Buffer.concat([length, chunk]));
      }
      
      // Send terminating zero-length chunk
      const zeroLength = Buffer.alloc(4);
      zeroLength.writeUInt32BE(0, 0);
      this.socket.write(zeroLength);
    });
  }

  /**
   * Send SCAN command for file path scanning
   */
  private async sendScanCommand(filePath: string): Promise<ClamAVResponse> {
    if (!this.socket) throw new Error('Not connected to ClamAV');

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let responseReceived = false;

      const timeout = setTimeout(() => {
        if (!responseReceived) {
          responseReceived = true;
          reject(new Error('ClamAV scan timeout'));
        }
      }, this.config.timeoutMs);

      const onData = (data: Buffer) => {
        chunks.push(data);
        const response = Buffer.concat(chunks).toString('ascii');
        
        if (response.endsWith('\n')) {
          responseReceived = true;
          clearTimeout(timeout);
          this.socket?.off('data', onData);
          
          try {
            resolve(this.parseScanResponse(response.trim()));
          } catch (e) {
            reject(e);
          }
        }
      };

      this.socket.on('data', onData);
      this.socket.write(`SCAN ${filePath}\n`);
    });
  }

  /**
   * Parse INSTREAM response
   */
  private parseInstreamResponse(response: string): ClamAVResponse {
    // Format: "stream: OK\n" or "stream: FOUND signature\n"
    const parts = response.split(' ');
    const status = parts[1]?.toUpperCase() || 'ERROR';
    const message = parts.slice(2).join(' ');

    return {
      status: status as ClamAVResponse['status'],
      message,
      signature: status === 'FOUND' ? message : undefined,
    };
  }

  /**
   * Parse SCAN response
   */
  private parseScanResponse(response: string): ClamAVResponse {
    // Format: "/path: OK\n" or "/path: FOUND signature\n"
    const colonIndex = response.indexOf(':');
    if (colonIndex === -1) {
      return { status: 'ERROR', message: 'Invalid response format' };
    }

    const statusPart = response.substring(colonIndex + 1).trim();
    const parts = statusPart.split(' ');
    const status = parts[0]?.toUpperCase() || 'ERROR';
    const message = parts.slice(1).join(' ');

    return {
      status: status as ClamAVResponse['status'],
      message,
      signature: status === 'FOUND' ? message : undefined,
    };
  }

  /**
   * Parse ClamAV response into ScanResult
   */
  private parseResponse(response: ClamAVResponse, durationMs: number, scannedBytes: number): ScanResult {
    let verdict: ScanVerdict;
    const matches: ScanMatch[] = [];

    switch (response.status) {
      case 'OK':
        verdict = 'clean';
        break;
      case 'FOUND':
        verdict = 'infected';
        matches.push({
          rule: response.signature || 'Unknown',
          namespace: 'clamav',
          tags: ['malware'],
          meta: { signature: response.signature || '' },
          offset: 0,
          length: 0,
        });
        break;
      case 'ERROR':
        verdict = 'error';
        break;
      case 'TIMEOUT':
        verdict = 'timeout';
        break;
      default:
        verdict = 'error';
    }

    return {
      verdict,
      scanner: 'clamav',
      timestamp: new Date().toISOString(),
      durationMs,
      matches,
      error: response.status === 'ERROR' ? response.message : undefined,
      scannedBytes,
    };
  }

  /**
   * Check if ClamAV is healthy
   */
  async ping(): Promise<boolean> {
    try {
      await this.connect();
      
      if (!this.socket) return false;
      
      return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 5000);
        
        const onData = (data: Buffer) => {
          const response = data.toString('ascii').trim();
          if (response === 'PONG') {
            clearTimeout(timeout);
            this.socket?.off('data', onData);
            resolve(true);
          }
        };
        
        this.socket?.on('data', onData);
        this.socket?.write('PING\n');
      });
    } catch {
      return false;
    }
  }

  /**
   * Get ClamAV version info
   */
  async version(): Promise<string | null> {
    try {
      await this.connect();
      
      if (!this.socket) return null;
      
      return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 5000);
        const chunks: Buffer[] = [];
        
        const onData = (data: Buffer) => {
          chunks.push(data);
          const response = Buffer.concat(chunks).toString('ascii');
          if (response.endsWith('\n')) {
            clearTimeout(timeout);
            this.socket?.off('data', onData);
            resolve(response.trim());
          }
        };
        
        this.socket?.on('data', onData);
        this.socket?.write('VERSION\n');
      });
    } catch {
      return null;
    }
  }

  /**
   * Reload ClamAV databases
   */
  async reload(): Promise<boolean> {
    try {
      await this.connect();
      
      if (!this.socket) return false;
      
      return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 30000);
        const chunks: Buffer[] = [];
        
        const onData = (data: Buffer) => {
          chunks.push(data);
          const response = Buffer.concat(chunks).toString('ascii');
          if (response.endsWith('\n')) {
            clearTimeout(timeout);
            this.socket?.off('data', onData);
            resolve(response.trim() === 'RELOADING');
          }
        };
        
        this.socket?.on('data', onData);
        this.socket?.write('RELOAD\n');
      });
    } catch {
      return false;
    }
  }
}

/**
 * Create a ClamAV client with environment-based configuration
 */
export function createClamAVClient(): ClamAVClient {
  return new ClamAVClient({
    clamdSocket: process.env.CLAMAV_SOCKET,
    clamdHost: process.env.CLAMAV_HOST,
    clamdPort: parseInt(process.env.CLAMAV_PORT || '3310', 10),
    timeoutMs: parseInt(process.env.CLAMAV_TIMEOUT_MS || '30000', 10),
    maxFileSizeBytes: parseInt(process.env.CLAMAV_MAX_SIZE || '104857600', 10),
  });
}