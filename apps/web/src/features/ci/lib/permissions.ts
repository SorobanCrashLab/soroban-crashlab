/**
 * Permission-aware projection of CI data (#2314).
 *
 * The server authorizes with `lib/rbac.ts`; this pure helper applies the
 * resulting role to the *shape* of the payload so an analyst never receives
 * internal artifacts and an anonymous viewer never receives log URLs. It is a
 * defence in depth measure, not an authorization decision.
 */

import { sanitizeUrl, type CiArtifact, type CiSnapshot } from './model';

export type CiRole = 'anonymous' | 'analyst' | 'maintainer';

export interface CiPermissions {
  canViewLogs: boolean;
  canViewArtifacts: boolean;
  canViewInternal: boolean;
  canManageSubscriptions: boolean;
}

export function permissionsForRole(role: CiRole | null | undefined): CiPermissions {
  if (role === 'maintainer') {
    return {
      canViewLogs: true,
      canViewArtifacts: true,
      canViewInternal: true,
      canManageSubscriptions: true,
    };
  }
  if (role === 'analyst') {
    return {
      canViewLogs: true,
      canViewArtifacts: true,
      canViewInternal: false,
      canManageSubscriptions: true,
    };
  }
  return {
    canViewLogs: false,
    canViewArtifacts: false,
    canViewInternal: false,
    canManageSubscriptions: false,
  };
}

function visibleArtifact(artifact: CiArtifact, permissions: CiPermissions): CiArtifact | null {
  if (artifact.internal && !permissions.canViewInternal) return null;
  const url = sanitizeUrl(artifact.url);
  if (!url) return null;
  return { ...artifact, url };
}

function publicAuthor(author: string): string {
  const login = author.startsWith('@') ? author.slice(1) : author;
  return login.replace(/@.*$/, '');
}

function safeLink(link: string | undefined, permissions: CiPermissions): string | undefined {
  const safe = sanitizeUrl(link);
  if (!safe) return undefined;
  if (!permissions.canViewInternal && /\/internal\/|internal:/i.test(safe)) return undefined;
  return safe;
}

/** Returns a new snapshot containing only data the role may see. */
export function filterSnapshotForPermissions(
  snapshot: CiSnapshot,
  permissions: CiPermissions,
): CiSnapshot {
  return {
    ...snapshot,
    runs: snapshot.runs.map((run) => ({
      ...run,
      htmlUrl: safeLink(run.htmlUrl, permissions),
      author: permissions.canViewInternal ? run.author : publicAuthor(run.author),
      jobs: run.jobs.map((job) => ({
        ...job,
        htmlUrl: safeLink(job.htmlUrl, permissions),
        steps: job.steps.map((step) => ({
          ...step,
          logUrl: permissions.canViewLogs ? safeLink(step.logUrl, permissions) : undefined,
          annotations: permissions.canViewLogs
            ? step.annotations
            : step.annotations.map((annotation) => ({
                ...annotation,
                path: undefined,
                line: undefined,
              })),
        })),
        artifacts: job.artifacts
          .map((artifact) => visibleArtifact(artifact, permissions))
          .filter((artifact): artifact is CiArtifact => Boolean(artifact)),
      })),
      checks: run.checks.map((check) => ({
        ...check,
        detailsUrl: permissions.canViewLogs ? safeLink(check.detailsUrl, permissions) : undefined,
      })),
      artifacts: run.artifacts
        .map((artifact) => visibleArtifact(artifact, permissions))
        .filter((artifact): artifact is CiArtifact => Boolean(artifact)),
    })),
    regressions: snapshot.regressions.map((item) => ({ ...item, link: safeLink(item.link, permissions) })),
    incidents: snapshot.incidents.map((item) => ({ ...item, link: safeLink(item.link, permissions) })),
    changes: snapshot.changes.map((item) => ({
      ...item,
      author: permissions.canViewInternal ? item.author : publicAuthor(item.author),
      files: permissions.canViewInternal ? item.files : [],
    })),
  };
}

/** Copy shown when a control is hidden because of permissions. */
export function permissionExplanation(permissions: CiPermissions): string | null {
  if (!permissions.canViewLogs) {
    return 'Log and check details require the analyst role. Ask a maintainer for access.';
  }
  if (!permissions.canViewInternal) {
    return 'Internal artifacts and file paths are visible to maintainers only.';
  }
  return null;
}
