/**
 * Malware Scan Result Types
 * 
 * Defines the result of malware scanning operations.
 * Used by ClamAV and YARA engines.
 */

export type ScanVerdict = 'clean' | 'infected' | 'suspicious' | 'error' | 'timeout';

export interface ScanMatch {
  rule: string;
  namespace: string;
  tags: string[];
  meta: Record<string, string>;
  offset: number;
  length: number;
}

export interface ScanResult {
  verdict: ScanVerdict;
  scanner: 'clamav' | 'yara' | 'combined';
  timestamp: string;
  durationMs: number;
  matches: ScanMatch[];
  error?: string;
  scannedBytes: number;
}

export interface QuarantineDecision {
  action: 'release' | 'quarantine' | 'reject';
  reason: string;
  scanResults: ScanResult[];
  requiresReview: boolean;
}

export interface ScannerConfig {
  enabled: boolean;
  timeoutMs: number;
  maxFileSizeBytes: number;
  // ClamAV specific
  clamdSocket?: string;
  clamdHost?: string;
  clamdPort?: number;
  // YARA specific
  rulesDirectory?: string;
  compiledRulesPath?: string;
}

export const DEFAULT_SCANNER_CONFIG: ScannerConfig = {
  enabled: true,
  timeoutMs: 30000,
  maxFileSizeBytes: 100 * 1024 * 1024, // 100MB
  clamdSocket: process.env.CLAMAV_SOCKET || '/var/run/clamav/clamd.ctl',
  clamdHost: process.env.CLAMAV_HOST || 'localhost',
  clamdPort: parseInt(process.env.CLAMAV_PORT || '3310', 10),
  rulesDirectory: process.env.YARA_RULES_DIR || '/etc/yara/rules',
  compiledRulesPath: process.env.YARA_COMPILED_RULES || '/etc/yara/compiled/rules.yar',
};

export function combineScanResults(results: ScanResult[]): ScanResult {
  const infected = results.some(r => r.verdict === 'infected');
  const suspicious = results.some(r => r.verdict === 'suspicious');
  const error = results.some(r => r.verdict === 'error');
  const timeout = results.some(r => r.verdict === 'timeout');

  let verdict: ScanVerdict = 'clean';
  if (infected) verdict = 'infected';
  else if (suspicious) verdict = 'suspicious';
  else if (error) verdict = 'error';
  else if (timeout) verdict = 'timeout';

  return {
    verdict,
    scanner: 'combined',
    timestamp: new Date().toISOString(),
    durationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
    matches: results.flatMap(r => r.matches),
    error: results.find(r => r.error)?.error,
    scannedBytes: Math.max(...results.map(r => r.scannedBytes)),
  };
}

export function makeQuarantineDecision(
  scanResult: ScanResult,
  policy: 'strict' | 'standard' | 'permissive' = 'standard'
): QuarantineDecision {
  const requiresReview = scanResult.verdict === 'suspicious' || scanResult.verdict === 'infected';

  switch (policy) {
    case 'strict':
      if (scanResult.verdict !== 'clean') {
        return {
          action: 'quarantine',
          reason: `Strict policy: ${scanResult.verdict} verdict`,
          scanResults: [scanResult],
          requiresReview: true,
        };
      }
      return {
        action: 'release',
        reason: 'Clean scan result',
        scanResults: [scanResult],
        requiresReview: false,
      };

    case 'standard':
      if (scanResult.verdict === 'infected') {
        return {
          action: 'quarantine',
          reason: 'Malware detected',
          scanResults: [scanResult],
          requiresReview: true,
        };
      }
      if (scanResult.verdict === 'suspicious') {
        return {
          action: 'quarantine',
          reason: 'Suspicious content detected',
          scanResults: [scanResult],
          requiresReview: true,
        };
      }
      if (scanResult.verdict === 'error' || scanResult.verdict === 'timeout') {
        return {
          action: 'quarantine',
          reason: `Scan ${scanResult.verdict}: ${scanResult.error || 'Unknown error'}`,
          scanResults: [scanResult],
          requiresReview: true,
        };
      }
      return {
        action: 'release',
        reason: 'Clean scan result',
        scanResults: [scanResult],
        requiresReview: false,
      };

    case 'permissive':
      if (scanResult.verdict === 'infected') {
        return {
          action: 'quarantine',
          reason: 'Malware detected',
          scanResults: [scanResult],
          requiresReview: true,
        };
      }
      return {
        action: 'release',
        reason: scanResult.verdict === 'clean' ? 'Clean scan result' : `Non-blocking: ${scanResult.verdict}`,
        scanResults: [scanResult],
        requiresReview: scanResult.verdict !== 'clean',
      };
  }
}