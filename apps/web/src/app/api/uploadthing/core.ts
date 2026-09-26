import { createUploadthing, type FileRouter } from 'uploadthing/next';
import { UploadThingError, UTApi } from 'uploadthing/server';
import { z } from 'zod';
import { isRedisConfigured, getRedis } from '@/lib/redis';
import {
  gateDeclaredUploads,
  ingestUploadedArtifact,
  UPLOAD_REJECTED_CODE,
  type ArtifactRecord,
} from '@/lib/artifact-ingestion';
import { isArtifactClass, UPLOADTHING_MAX_FILE_SIZE, type UploadRejectionReason } from '@/lib/upload-validation';

interface UploadRejectionData {
  uploadRejection: UploadRejectionReason;
}

function isUploadRejection(data: unknown): data is UploadRejectionData {
  return typeof data === 'object' && data !== null && 'uploadRejection' in data;
}

const f = createUploadthing({
  // Gate rejections carry the standard `{ error, code }` envelope fields; the
  // route re-emits them as 422 (#1636). `message` stays for the SDK client.
  errorFormatter: (err) =>
    isUploadRejection(err.data)
      ? { message: err.message, error: err.message, code: UPLOAD_REJECTED_CODE, reason: err.data.uploadRejection }
      : { message: err.message },
});

async function persistArtifact(record: ArtifactRecord): Promise<void> {
  const redis = getRedis();
  await redis.set(`artifact:${record.id}`, JSON.stringify(record));
  if (record.runId) {
    await redis.sadd(`artifact:run:${record.runId}`, record.id);
  }
  await redis.sadd('artifact:index', record.id);
}

export const crashlabFileRouter = {
  fuzzArtifact: f({
    // Only a coarse ceiling: per-class caps are enforced by the ingestion
    // gate, and this equals the largest of them (pinned by test).
    blob: { maxFileSize: UPLOADTHING_MAX_FILE_SIZE, maxFileCount: 1 },
  })
    .input(z.object({
      runId: z.string().optional(),
      artifactType: z.string().optional(),
    }))
    .middleware(async ({ input, files }) => {
      const gate = gateDeclaredUploads(files, input.artifactType, input.runId);
      if (!gate.ok) {
        throw new UploadThingError({
          code: 'BAD_REQUEST',
          message: gate.message,
          data: { uploadRejection: gate.reason } satisfies UploadRejectionData,
        });
      }
      if (!isRedisConfigured()) {
        throw new UploadThingError('Storage not configured');
      }
      return { runId: input.runId, artifactType: gate.artifactClass };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // Metadata was produced by the gate above, so this always holds.
      if (!isArtifactClass(metadata.artifactType)) {
        throw new UploadThingError('Upload reached storage without passing the ingestion gate');
      }
      return ingestUploadedArtifact(
        file,
        { artifactClass: metadata.artifactType, runId: metadata.runId },
        {
          deleteStoredFile: async (key) => {
            await new UTApi().deleteFiles(key);
          },
          persist: persistArtifact,
        },
      );
    }),
} satisfies FileRouter;

export type CrashlabFileRouter = typeof crashlabFileRouter;
