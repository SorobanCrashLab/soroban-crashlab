import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { selectArtifactRepository, type ArtifactRepository } from '@/lib/storage/artifact-repository';

// Mock the artifact repository used by the route (filesystem-backed by default).
vi.mock('@/lib/storage/artifact-repository', () => ({
  selectArtifactRepository: vi.fn(),
}));

function mockRepository(overrides: Partial<ArtifactRepository> = {}) {
  const repository: ArtifactRepository = {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
  vi.mocked(selectArtifactRepository).mockReturnValue(repository);
  return repository;
}

describe('GET /api/artifacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a list of artifacts', async () => {
    const repository = mockRepository({
      list: vi.fn().mockResolvedValue([
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
      ]),
    });

    const response = await GET();
    expect(response.status).toBe(200);
    const json = (await response.json()) as { data: Record<string, unknown> };
    expect(json.data).toHaveProperty('artifacts');
    expect(json.data).toHaveProperty('total', 2);
    expect(Array.isArray(json.data.artifacts)).toBe(true);
    expect(repository.list).toHaveBeenCalledTimes(1);
  });

  it('returns empty list when no artifacts exist', async () => {
    mockRepository({ list: vi.fn().mockResolvedValue([]) });

    const response = await GET();

    expect(response.status).toBe(200);
    const json = (await response.json()) as { data: Record<string, unknown> };
    expect(json.data.artifacts).toEqual([]);
    expect(json.data.total).toBe(0);
  });
});

describe('POST /api/artifacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves an uploaded artifact and returns metadata', async () => {
    mockRepository({
      put: vi.fn().mockResolvedValue({
        id: 'test-bundle.json',
        name: 'test-bundle.json',
        createdAt: '2026-06-26T10:00:00.000Z',
        sizeBytes: 1024,
      }),
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
    const json = (await response.json()) as { data: { artifact: Record<string, unknown> } };
    expect(json.data.artifact).toHaveProperty('name', 'test-bundle.json');
    expect(json.data.artifact).toHaveProperty('id', 'test-bundle.json');
  });

  it('returns 400 when file is missing', async () => {
    mockRepository();

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
    const repository = mockRepository({
      put: vi.fn().mockResolvedValue({
        id: 'artifact.bin',
        name: 'artifact.bin',
        createdAt: '2026-06-26T10:00:00.000Z',
        sizeBytes: 512,
      }),
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

    expect(repository.put).toHaveBeenCalledWith('artifact.bin', expect.any(Buffer));
  });
});