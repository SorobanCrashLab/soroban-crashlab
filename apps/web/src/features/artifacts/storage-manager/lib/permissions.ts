/**
 * Role-based capabilities for the artifact manager (#2342).
 *
 * The server resolves the role (RBAC) and projects every payload through
 * these helpers; the client only uses them to hide controls it would be
 * refused anyway.
 */

import type { ManagedArtifact } from './model';

export type ArtifactRole = 'anonymous' | 'analyst' | 'maintainer';

export interface ArtifactPermissions {
  viewRestricted: boolean;
  download: boolean;
  preview: boolean;
  tag: boolean;
  requestDeletion: boolean;
  approveDeletion: boolean;
  managePolicies: boolean;
  manageHolds: boolean;
}

export function permissionsForRole(role: ArtifactRole): ArtifactPermissions {
  const analyst = role === 'analyst' || role === 'maintainer';
  const maintainer = role === 'maintainer';
  return {
    viewRestricted: maintainer,
    download: analyst,
    preview: analyst,
    tag: analyst,
    requestDeletion: analyst,
    approveDeletion: maintainer,
    managePolicies: maintainer,
    manageHolds: maintainer,
  };
}

export const REDACTED = '[REDACTED]';

/**
 * Anonymous viewers never see restricted artifacts; analysts see that one
 * exists (so retention and lineage stay explainable) with identifying
 * metadata masked; maintainers see everything.
 */
export function projectArtifact(artifact: ManagedArtifact, role: ArtifactRole): ManagedArtifact | null {
  if (artifact.sensitivity !== 'restricted' || role === 'maintainer') return artifact;
  if (role === 'anonymous') return null;
  return {
    ...artifact,
    name: 'Restricted artifact',
    key: REDACTED,
    bucket: REDACTED,
    createdBy: { kind: artifact.createdBy.kind, id: REDACTED },
    tags: [],
    scan: { ...artifact.scan, findings: artifact.scan.findings.length > 0 ? [REDACTED] : [] },
    redacted: true,
  };
}

export function permissionExplanation(role: ArtifactRole): string {
  switch (role) {
    case 'maintainer':
      return 'Maintainer: full access, including restricted artifacts, policies, holds and deletion approval.';
    case 'analyst':
      return 'Analyst: browse, preview, download non-restricted artifacts, tag and request deletion. Restricted metadata is masked.';
    case 'anonymous':
      return 'Signed out: public and internal metadata only. Sign in to preview or download.';
  }
}
