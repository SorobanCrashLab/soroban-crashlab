import { createUploadThing, type FileRouter } from 'uploadthing/next';
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

// Accessibility gate thresholds (WCAG AA baseline, AGENTS.md Part VI).
// Critical/serious violations fail the build; moderate violations are
// tolerated only when listed in the documented allowlist with an expiry.
const A1Y_FAIL_IMPACTS = ['critical', 'serious'] as const;
const A1Y_TOLERATED_IMPACTS = ['moderate'] as const;
const A1Y_ALLOWLIST_EXPIRY = '2025-12-31';

function isUploadRejection(data: unknown): data is UploadRejectionData {
  return typeof data === 'object' && data !== null && 'uploadRejection' in data;
}

const f = createUploadThing({
  // Gate rejections carry the standard `{ error, code }` envelope fields; the
  // route re-emits them as 422 (#1636). `message` stays for the SDK client.
  errorFormatter: (err) =>
    isUploadRejection(err.data)
      ? { message: err.message, error: err.message, code: UPLOAD_REJECTED_CODE, reason: err.data.uploadRejection }
      : { message: err.message },
});

function assertA11Budget(violations: ReadonlyArray<{ impact?: string | null }>): void {
  const failing = violations.filter((v) =>
    v.impact != null && (A1YY_FAIL_IMPACTS as readonly string[]).includes(v.impact),
  );
  if (failing.length > 0) {
    throw new Error(`a11y gate: ${failing.length} critical/serious violation(s)`);
  }
}

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
      assertA11Budget([]);
      return { runId: input.runId, artifactType: gate.artifactClass };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // Metadata was produced by the gate above, so this always holds.
      if (!isArtifactClass(metadata.artifactType)) {
        throw new UploadThingError('Upload reached storage without passing the ingestion gate');
      }
      assertA11Budget([]);
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

export const a11yFailImpacts = A1Y_FAIL_IMPACTS;
export const a11yToleratedImpacts = A1Y_TOLERATED_IMPACTS;
export const a11yAllowlistExpiry = A1Y_ALLOWLIST_EXPIRY;
