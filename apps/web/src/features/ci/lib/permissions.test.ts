import { describe, expect, it } from 'vitest';
import type { CiSnapshot } from './model';
import { filterSnapshotForPermissions, permissionsForRole } from './permissions';

function snapshot(): CiSnapshot {
  return {
    repository: 'org/repo',
    source: 'mock',
    generatedAt: '2026-11-23T09:00:00.000Z',
    runs: [
      {
        id: 'run-1',
        workflowName: 'CI',
        event: 'pull_request',
        branch: 'feat',
        commitSha: 'a'.repeat(40),
        commitMessage: 'test',
        author: '@alice@example.com',
        attempt: 1,
        status: 'completed',
        conclusion: 'failure',
        createdAt: '2026-11-23T08:00:00.000Z',
        updatedAt: '2026-11-23T08:10:00.000Z',
        durationMs: 1_000,
        htmlUrl: 'https://github.com/org/repo/actions/runs/1?token=secret',
        jobs: [
          {
            id: 'job-1',
            name: 'e2e',
            workflowName: 'CI',
            status: 'completed',
            conclusion: 'failure',
            durationMs: 1_000,
            steps: [
              {
                id: 's1',
                name: 'checkout.spec',
                number: 1,
                status: 'completed',
                conclusion: 'failure',
                durationMs: 1_000,
                logUrl: 'https://ci.example/log?token=abc123',
                annotations: [{ level: 'failure', message: 'timeout', path: 'internal/path.ts', line: 4 }],
              },
            ],
            artifacts: [
              { id: 'a1', name: 'public', kind: 'report', sizeBytes: 10, url: 'https://ci.example/a1' },
              { id: 'a2', name: 'internal', kind: 'log', sizeBytes: 10, url: 'https://ci.example/a2', internal: true },
            ],
            gates: ['e2e'],
          },
        ],
        checks: [
          {
            id: 'c1',
            name: 'check',
            conclusion: 'failure',
            status: 'completed',
            required: true,
            detailsUrl: 'https://ci.example/check?sig=xyz',
          },
        ],
        artifacts: [],
        metrics: [],
        codeAreas: ['web'],
      },
    ],
    regressions: [
      {
        id: 'reg-1',
        fingerprint: 'f',
        title: 'r',
        status: 'open',
        detectedAt: '2026-11-23T08:00:00.000Z',
        areas: ['web'],
        link: 'https://ci.example/internal/incident/1',
      },
    ],
    incidents: [],
    changes: [
      {
        id: 'chg-1',
        title: 'c',
        author: 'bob@example.com',
        mergedAt: '2026-11-23T08:00:00.000Z',
        areas: ['web'],
        files: ['src/secret.ts'],
      },
    ],
    policy: {
      coverageMinPct: 80,
      coverageDeltaTolerancePct: 0.5,
      perfMaxMs: 1800,
      perfDeltaTolerancePct: 5,
      visualDiffMaxPct: 0.5,
      visualDeltaTolerancePct: 0.25,
      mutationMinPct: 60,
      maxCriticalVulns: 0,
      maxHighVulns: 2,
    },
  };
}

describe('permissionsForRole', () => {
  it('grants capabilities monotonically', () => {
    expect(permissionsForRole('anonymous')).toEqual({
      canViewLogs: false,
      canViewArtifacts: false,
      canViewInternal: false,
      canManageSubscriptions: false,
    });
    expect(permissionsForRole('analyst').canViewLogs).toBe(true);
    expect(permissionsForRole('analyst').canViewInternal).toBe(false);
    expect(permissionsForRole('maintainer').canViewInternal).toBe(true);
  });
});

describe('filterSnapshotForPermissions', () => {
  const original = snapshot();

  it('strips secrets, internal artifacts and private paths for anonymous viewers', () => {
    const filtered = filterSnapshotForPermissions(original, permissionsForRole('anonymous'));
    const run = filtered.runs[0];
    expect(run.htmlUrl).toBe('https://github.com/org/repo/actions/runs/1');
    expect(run.jobs[0].steps[0].logUrl).toBeUndefined();
    expect(run.jobs[0].steps[0].annotations[0].path).toBeUndefined();
    expect(run.jobs[0].artifacts.map((item) => item.name)).toEqual(['public']);
    expect(run.checks[0].detailsUrl).toBeUndefined();
    expect(filtered.regressions[0].link).toBeUndefined();
    expect(filtered.changes[0].files).toEqual([]);
    expect(original.runs[0].jobs[0].steps[0].logUrl).toContain('token=abc123');
  });

  it('keeps sanitized evidence for analysts and everything for maintainers', () => {
    const analyst = filterSnapshotForPermissions(original, permissionsForRole('analyst'));
    expect(analyst.runs[0].jobs[0].steps[0].logUrl).toBe('https://ci.example/log');
    expect(analyst.runs[0].checks[0].detailsUrl).toBe('https://ci.example/check');
    expect(analyst.runs[0].author).toBe('alice');
    const maintainer = filterSnapshotForPermissions(original, permissionsForRole('maintainer'));
    expect(maintainer.runs[0].author).toBe('@alice@example.com');
    expect(maintainer.runs[0].jobs[0].artifacts).toHaveLength(2);
  });
});
