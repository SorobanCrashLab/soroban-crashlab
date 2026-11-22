'use client';

import { useCallback, useState } from 'react';
import { useUploadThing } from '@/lib/uploadthing-helpers';

interface ArtifactUploaderProps {
  runId?: string;
  artifactType?: string;
  onUploadComplete?: (url: string, artifactId: string) => void;
  className?: string;
}

export function ArtifactUploader({
  runId,
  artifactType = 'bundle',
  onUploadComplete,
  className = '',
}: ArtifactUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { startUpload, isUploading } = useUploadThing('fuzzArtifact', {
    onClientUploadComplete: (res) => {
      setUploading(false);
      const uploaded = res?.[0];
      if (!uploaded) return;
      // The ingestion gate deletes content that fails validation (#1636).
      const serverData = uploaded.serverData;
      if (serverData && !serverData.accepted) {
        setError(serverData.message);
        return;
      }
      onUploadComplete?.(uploaded.url, uploaded.key);
    },
    onUploadError: (err) => {
      setUploading(false);
      setError(err.message);
    },
  });

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setError(null);
      setUploading(true);

      try {
        await startUpload([file], { runId, artifactType });
      } catch (err) {
        setUploading(false);
        setError(err instanceof Error ? err.message : 'Upload failed');
      }
    },
    [startUpload, runId, artifactType],
  );

  return (
    <div className={className}>
      <label className="block cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors hover:border-[var(--accent)] hover:bg-[var(--surface-hover)]">
        <input
          type="file"
          className="sr-only"
          onChange={handleFileChange}
          disabled={uploading || isUploading}
        />
        <div className="space-y-2">
          <svg
            className="mx-auto h-8 w-8"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
            />
          </svg>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {uploading || isUploading ? 'Uploading...' : 'Click to upload artifact'}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            WASM (max 16MB), JSON bundle or seed (max 5MB), log or trace (max 10MB)
          </p>
        </div>
      </label>

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
