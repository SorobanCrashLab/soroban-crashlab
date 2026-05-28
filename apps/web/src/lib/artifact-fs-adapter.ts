import fs from 'node:fs/promises';
import path from 'node:path';

export interface ArtifactMetadata {
  id: string;
  name: string;
  createdAt: string;
  sizeBytes: number;
}

function getArtifactDir(): string {
  const dir = process.env.CRASHLAB_ARTIFACT_DIR;
  if (!dir) {
    throw new Error('CRASHLAB_ARTIFACT_DIR environment variable is not set');
  }
  return dir;
}

function sanitizeId(id: string): string {
  if (id.includes('..') || id.includes('/') || id.includes('\\')) {
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
