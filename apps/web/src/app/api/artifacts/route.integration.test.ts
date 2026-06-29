import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';

// Mock the artifact adapter
vi.mock('@/lib/artifact-fs-adapter', () => ({
  listArtifactMetadata: vi.fn(),
  saveArtifact: vi.fn(),
}));

describe('GET /api/artifacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a list of artifacts', async () => {
    const { listArtifactMetadata } = await import('@/lib/artifact-fs-adapter');
    
    (listArtifactMetadata as unknown as { mockResolvedValue: (value: unknown) => unknown }).mockResolvedValue([
      {
        id: 'bundle-1.json',
        name: 'bundle-1.json',
        createdAt: '2026-06-26T10:00:00.000Z',
        sizeBytes: 2048,
      },
      {
        id: 'bundle-2.json',
        name: 'bundle-2.json',
        createdAt: '2026-06-26T09:00:00.000Z',
        sizeBytes: 4096,
      },
    ]);

    const request = new NextRequest('http://localhost/api/artifacts', {
      method: 'GET',
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    const json = (await response.json()) as Record<string, unknown>;
    expect(json).toHaveProperty('artifacts');
    expect(json).toHaveProperty('total', 2);
    expect(Array.isArray(json.artifacts)).toBe(true);
  });

  it('returns empty list when no artifacts exist', async () => {
    const { listArtifactMetadata } = await import('@/lib/artifact-fs-adapter');
    (listArtifactMetadata as unknown as { mockResolvedValue: (value: unknown) => unknown }).mockResolvedValue([]);

    const request = new NextRequest('http://localhost/api/artifacts', {
      method: 'GET',
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    const json = (await response.json()) as Record<string, unknown>;
    expect(json.artifacts).toEqual([]);
    expect(json.total).toBe(0);
  });
});

describe('POST /api/artifacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves an uploaded artifact and returns metadata', async () => {
    const { saveArtifact } = await import('@/lib/artifact-fs-adapter');
    
    (saveArtifact as unknown as { mockResolvedValue: (value: unknown) => unknown }).mockResolvedValue({
      id: 'test-bundle.json',
      name: 'test-bundle.json',
      createdAt: '2026-06-26T10:00:00.000Z',
      sizeBytes: 1024,
    });

    const formData = new FormData();
    const file = new File([JSON.stringify({ data: 'test' })], 'test-bundle.json', {
      type: 'application/json',
    });
    formData.append('file', file);

    const request = new NextRequest('http://localhost/api/artifacts', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    const json = (await response.json()) as Record<string, unknown>;
    expect(json).toHaveProperty('name', 'test-bundle.json');
    expect(json).toHaveProperty('id', 'test-bundle.json');
  });

  it('returns 400 when file is missing', async () => {
    const formData = new FormData();
    
    const request = new NextRequest('http://localhost/api/artifacts', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const json = (await response.json()) as Record<string, unknown>;
    expect(json).toHaveProperty('error');
  });

  it('calls saveArtifact with file name and buffer', async () => {
    const { saveArtifact } = await import('@/lib/artifact-fs-adapter');
    
    (saveArtifact as unknown as { mockResolvedValue: (value: unknown) => unknown }).mockResolvedValue({
      id: 'artifact.bin',
      name: 'artifact.bin',
      createdAt: '2026-06-26T10:00:00.000Z',
      sizeBytes: 512,
    });

    const formData = new FormData();
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'artifact.bin', {
      type: 'application/octet-stream',
    });
    formData.append('file', file);

    const request = new NextRequest('http://localhost/api/artifacts', {
      method: 'POST',
      body: formData,
    });

    await POST(request);

    expect(saveArtifact).toHaveBeenCalledWith('artifact.bin', expect.any(Buffer));
  });
});
