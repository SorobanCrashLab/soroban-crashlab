import {
  deleteArtifactById,
  getArtifactById,
  listArtifactMetadata,
  saveArtifact,
  type ArtifactMetadata,
} from '@/lib/artifact-fs-adapter';

export interface ArtifactRepository {
  list(): ReturnType<typeof listArtifactMetadata>;
  get(id: string): ReturnType<typeof getArtifactById>;
  put(name: string, bytes: Buffer): ReturnType<typeof saveArtifact>;
  delete(id: string): ReturnType<typeof deleteArtifactById>;
}

const filesystemRepository: ArtifactRepository = {
  list: listArtifactMetadata,
  get: getArtifactById,
  put: saveArtifact,
  delete: deleteArtifactById,
};

export function selectArtifactRepository(): ArtifactRepository {
  return filesystemRepository;
}

export type { ArtifactMetadata };