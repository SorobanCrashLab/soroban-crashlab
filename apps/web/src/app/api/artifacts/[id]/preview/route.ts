/**
 * /api/artifacts/[id]/preview — Secure Artifact Preview Sandbox (#2337).
 *
 * GET returns a script-free sandboxed srcDoc plus redaction/trust/policy metadata.
 * No artifact bytes are ever injected as executable markup.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_REDACTION_RULES,
  SANDBOX_POLICY,
  buildSandboxDocument,
  detectContentType,
  evaluateAccess,
  evaluateDownload,
  redact,
  summarizeForForensics,
  type Artifact,
  type PreviewPolicy,
} from '@/features/artifact-preview/model';

export const dynamic = 'force-dynamic';

const policy: PreviewPolicy = {
  allowDownload: true,
  allowCopy: false,
  requireCleanScan: true,
  requireCanViewSensitive: true,
};

const artifacts: Record<string, Artifact> = {
  sample: {
    id: 'sample',
    name: 'crash.log',
    mimeType: 'text/plain',
    sizeBytes: 86,
    content: '2026-01-01T00:00:00Z INFO start\nERROR api_keyABC12345 for alice@example.com',
    sha256: '9f2c1a4b',
    scanStatus: 'clean',
    quarantined: false,
    sensitive: true,
  },
};

interface PreviewRouteProps {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: PreviewRouteProps) {
  const { id } = await params;
  const artifact = artifacts[id] ?? {
    ...artifacts.sample,
    id,
    name: `${id}.txt`,
    content: 'Artifact not found in the demo store.',
    sensitive: false,
  };

  const kind = detectContentType(artifact.name, artifact.mimeType, artifact.content);
  const redacted = redact(artifact.content, DEFAULT_REDACTION_RULES);
  const permissions = {
    canViewSensitive: request.nextUrl.searchParams.get('reveal') === 'true',
    canDownload: request.nextUrl.searchParams.get('canDownload') !== 'false',
  };

  return NextResponse.json({
    artifact: { id: artifact.id, name: artifact.name, kind, sha256: artifact.sha256, scanStatus: artifact.scanStatus },
    sandbox: SANDBOX_POLICY,
    srcDoc: buildSandboxDocument(artifact, kind, redacted.text),
    redaction: redacted.findings,
    forensics: summarizeForForensics(artifact.content, artifact.sha256),
    access: evaluateAccess(artifact, policy, permissions),
    download: evaluateDownload(artifact, policy, permissions),
  });
}
