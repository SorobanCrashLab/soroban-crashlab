import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export interface ArtifactMetadata {
  id: string;
  name: string;
  createdAt: string;
  sizeBytes: number;
}

function getArtifactDir(): string {
  return process.env.CRASHLAB_ARTIFACT_DIR || path.join(os.tmpdir(), 'crashlab-artifacts');
}

function sanitizeId(id: string): string {
  if (id === '..' || id.includes('/') || id.includes('\\')) {
    throw new Error('Invalid artifact ID');
  }
  return id;
}

export async function getArtifactDirOrCreate(): Promise<string> {
  const dir = getArtifactDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function listArtifactMetadata(): Promise<ArtifactMetadata[]> {
  const dir = await getArtifactDirOrCreate();
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const artifacts: ArtifactMetadata[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const filePath = path.join(dir, entry.name);
    const stat = await fs.stat(filePath);
    artifacts.push({
      id: entry.name,
      name: entry.name,
      createdAt: stat.birthtime.toISOString(),
      sizeBytes: stat.size,
    });
  }

  artifacts.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return artifacts;
}

export async function getArtifactById(id: string): Promise<{
  metadata: ArtifactMetadata;
  buffer: Buffer;
} | null> {
  const dir = await getArtifactDirOrCreate();
  const safeId = sanitizeId(id);
  const filePath = path.join(dir, safeId);

  try {
    const stat = await fs.stat(filePath);
    const buffer = await fs.readFile(filePath);
    return {
      metadata: {
        id: safeId,
        name: safeId,
        createdAt: stat.birthtime.toISOString(),
        sizeBytes: stat.size,
      },
      buffer,
    };
  } catch {
    return null;
  }
}

export async function deleteArtifactById(id: string): Promise<boolean> {
  const dir = await getArtifactDirOrCreate();
  const safeId = sanitizeId(id);
  const filePath = path.join(dir, safeId);

  try {
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function saveArtifact(name: string, buffer: Buffer): Promise<ArtifactMetadata> {
  const dir = await getArtifactDirOrCreate();
  const safeName = sanitizeId(name);
  const filePath = path.join(dir, safeName);
  await fs.writeFile(filePath, buffer);
  const stat = await fs.stat(filePath);
  return {
    id: safeName,
    name: safeName,
    createdAt: stat.birthtime.toISOString(),
    sizeBytes: stat.size,
  };
}

/**
 * Metadata record for a logical artifact entry. Kept distinct from the
 * on-disk `ArtifactMetadata` used by the fs adapter: it carries run/type
 * context for artifacts that may be backed by either storage rather than
 * a single flat directory of files.
 */
export interface ArtifactRecord {
  id: string;
  runId: string;
  type: 'crash' | 'seed' | 'trace' | 'coverage';
  size: number;
  timestamp: number;
  path: string;
}

export interface ArtifactContent {
  metadata: ArtifactRecord;
  data: string | Buffer;
}

export interface ArtifactValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate artifact metadata structure
 */
export function validateArtifactMetadata(metadata: unknown): ArtifactValidationResult {
  const errors: string[] = [];

  if (typeof metadata !== 'object' || metadata === null) {
    errors.push('Metadata must be an object');
    return { valid: false, errors };
  }

  const m = metadata as Partial<ArtifactRecord>;

  if (!m.id || typeof m.id !== 'string') {
    errors.push('id must be a non-empty string');
  }

  if (!m.runId || typeof m.runId !== 'string') {
    errors.push('runId must be a non-empty string');
  }

  if (!m.type || !['crash', 'seed', 'trace', 'coverage'].includes(m.type as string)) {
    errors.push('type must be one of: crash, seed, trace, coverage');
  }

  if (typeof m.size !== 'number' || m.size < 0) {
    errors.push('size must be a non-negative number');
  }

  if (typeof m.timestamp !== 'number' || m.timestamp < 0) {
    errors.push('timestamp must be a non-negative number');
  }

  if (!m.path || typeof m.path !== 'string') {
    errors.push('path must be a non-empty string');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Generate artifact ID from run ID and type
 */
export function generateArtifactId(runId: string, type: string, index: number = 0): string {
  const timestamp = Date.now();
  return `artifact-${runId}-${type}-${index}-${timestamp}`;
}

/**
 * Parse artifact ID to extract components
 *
 * IDs follow the `artifact-<runId>-<type>-<index>-<timestamp>` shape, so the
 * fixed-width trailing fields (type, index, timestamp) are read from the end
 * and everything in between belongs to the run ID — that keeps parsing
 * correct for run IDs that themselves contain dashes (e.g. "run-100").
 */
export function parseArtifactId(artifactId: string): {
  runId: string | null;
  type: string | null;
  index: number | null;
  timestamp: number | null;
} {
  const parts = artifactId.split('-');

  if (parts.length < 5 || parts[0] !== 'artifact') {
    return { runId: null, type: null, index: null, timestamp: null };
  }

  const timestamp = parseInt(parts[parts.length - 1], 10);
  const index = parseInt(parts[parts.length - 2], 10);
  const type = parts[parts.length - 3];

  return {
    runId: parts.slice(1, parts.length - 3).join('-'),
    type,
    index: Number.isNaN(index) ? null : index,
    timestamp: Number.isNaN(timestamp) ? null : timestamp,
  };
}

/**
 * Get artifact file extension based on type
 */
export function getArtifactExtension(type: string): string {
  switch (type) {
    case 'crash':
      return '.crash.json';
    case 'seed':
      return '.seed.bin';
    case 'trace':
      return '.trace.log';
    case 'coverage':
      return '.coverage.json';
    default:
      return '.artifact';
  }
}

/**
 * Build artifact file path
 */
export function buildArtifactPath(runId: string, artifactId: string, type: string): string {
  const extension = getArtifactExtension(type);
  return `artifacts/${runId}/${artifactId}${extension}`;
}

/**
 * Validate artifact content size
 */
export function validateArtifactSize(size: number, maxSize: number = 10_485_760): boolean {
  return size >= 0 && size <= maxSize;
}

/**
 * Filter artifacts by type
 */
export function filterArtifactsByType(
  artifacts: ArtifactRecord[],
  type: ArtifactRecord['type']
): ArtifactRecord[] {
  return artifacts.filter((a) => a.type === type);
}

/**
 * Sort artifacts by timestamp (newest first)
 */
export function sortArtifactsByTime(artifacts: ArtifactRecord[]): ArtifactRecord[] {
  return [...artifacts].sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Group artifacts by run ID
 */
export function groupArtifactsByRun(
  artifacts: ArtifactRecord[]
): Map<string, ArtifactRecord[]> {
  const groups = new Map<string, ArtifactRecord[]>();

  for (const artifact of artifacts) {
    const existing = groups.get(artifact.runId) ?? [];
    groups.set(artifact.runId, [...existing, artifact]);
  }

  return groups;
}

/**
 * Calculate total size of artifacts
 */
export function calculateTotalSize(artifacts: ArtifactRecord[]): number {
  return artifacts.reduce((sum, artifact) => sum + artifact.size, 0);
}

/**
 * Find artifact by ID
 */
export function findArtifactById(
  artifacts: ArtifactRecord[],
  id: string
): ArtifactRecord | null {
  return artifacts.find((a) => a.id === id) ?? null;
}

/**
 * Check if artifact path is safe (prevents path traversal)
 */
export function isSafeArtifactPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');

  // Check for path traversal attempts
  if (normalized.includes('../') || normalized.includes('..\\')) {
    return false;
  }

  // Check for absolute paths
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    return false;
  }

  // Must start with artifacts/
  if (!normalized.startsWith('artifacts/')) {
    return false;
  }

  return true;
}