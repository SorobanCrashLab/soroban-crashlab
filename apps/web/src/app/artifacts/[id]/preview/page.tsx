import type { Metadata } from 'next';
import { ArtifactPreviewSandbox } from '@/features/artifact-preview/ArtifactPreviewSandbox';
import type { Artifact } from '@/features/artifact-preview/model';

export const metadata: Metadata = {
  title: 'Secure artifact preview | Soroban CrashLab',
  description: 'Sandboxed, redacted and policy-controlled artifact inspection.',
};
export const dynamic = 'force-dynamic';

interface PreviewPageProps {
  params: Promise<{ id: string }>;
}

const sample: Artifact = {
  id: 'sample',
  name: 'crash.log',
  mimeType: 'text/plain',
  sizeBytes: 86,
  content: '2026-01-01T00:00:00Z INFO start\n2026-01-01T00:00:01Z ERROR token api_keyABC12345 for alice@example.com',
  sha256: '9f2c1a4b',
  scanStatus: 'clean',
  quarantined: false,
  sensitive: true,
};

export default async function ArtifactPreviewPage({ params }: PreviewPageProps) {
  const { id } = await params;
  return (
    <div className="container-full page-padding fade-in">
      <h1 id="artifact-preview-heading" className="heading-page">Artifact preview · {id}</h1>
      <p className="text-meta mt-1 mb-6 max-w-3xl">
        Artifacts render inside an isolated sandbox with scripts disabled and deterministic redaction of secrets.
      </p>
      <ArtifactPreviewSandbox artifact={sample} />
    </div>
  );
}
