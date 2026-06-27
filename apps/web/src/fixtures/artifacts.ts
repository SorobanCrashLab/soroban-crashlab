export interface FixtureArtifact {
  id: string;
  name: string;
  type: 'seed' | 'log' | 'trace' | 'coverage' | 'bundle';
  size: number;
  updatedAt: string;
  runId?: string;
  content_hash?: string;
}

export const MOCK_ARTIFACTS: FixtureArtifact[] = [
  { id: 'art-001', name: 'seed_2026_03_29_001.bin', type: 'seed', size: 1024 * 45, updatedAt: '2026-03-29T10:00:00Z', runId: 'run-1000', content_hash: 'a1b2c3d4' },
  { id: 'art-002', name: 'fuzzer_stdout.log', type: 'log', size: 1024 * 128, updatedAt: '2026-03-29T10:05:00Z', runId: 'run-1000' },
  { id: 'art-003', name: 'execution_trace.json', type: 'trace', size: 1024 * 1024 * 2.5, updatedAt: '2026-03-29T10:10:00Z', runId: 'run-1001', content_hash: 'e5f6g7h8' },
  { id: 'art-004', name: 'coverage_report_nightly.zip', type: 'coverage', size: 1024 * 512, updatedAt: '2026-03-29T09:30:00Z' },
  { id: 'art-005', name: 'mutant_envelope_fail.xdr', type: 'seed', size: 1024 * 12, updatedAt: '2026-03-28T22:00:00Z', runId: 'run-1005' },
  { id: 'art-006', name: 'bundle_archive.tar.gz', type: 'bundle', size: 1024 * 1024 * 15.2, updatedAt: '2026-03-28T18:45:00Z' },
];
