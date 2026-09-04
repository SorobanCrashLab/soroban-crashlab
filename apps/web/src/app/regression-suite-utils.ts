import type { FuzzingRun, RunStatus } from './types';

export type SuiteOutcome = 'passed' | 'failed';
export type MatrixStatus = 'passed' | 'failed' | 'regression' | 'regressed-fix' | 'never-ran';

export interface SuiteMember {
  runId: string;
  originalOutcome: SuiteOutcome;
}

export interface RegressionSuite {
  id: string;
  name: string;
  members: SuiteMember[];
  createdAt: string;
  updatedAt: string;
}

export interface MatrixResult {
  runId: string;
  originalOutcome: SuiteOutcome;
  currentOutcome?: SuiteOutcome;
  status: MatrixStatus;
  error?: string;
  originalRun?: FuzzingRun;
  currentRun?: FuzzingRun;
}

export interface SuiteGateway {
  list(): RegressionSuite[];
  get(id: string): RegressionSuite | undefined;
  save(suite: RegressionSuite): void;
  delete(id: string): void;
}

export const SUITES_STORAGE_KEY = 'crashlab:regression-suites:v1';

function cloneSuite(suite: RegressionSuite): RegressionSuite {
  return { ...suite, members: suite.members.map((member) => ({ ...member })) };
}

export function createInMemorySuiteGateway(seed: readonly RegressionSuite[] = []): SuiteGateway {
  const suites = new Map(seed.map((suite) => [suite.id, cloneSuite(suite)]));
  return {
    list: () => [...suites.values()].map(cloneSuite),
    get: (id) => {
      const suite = suites.get(id);
      return suite ? cloneSuite(suite) : undefined;
    },
    save: (suite) => suites.set(suite.id, cloneSuite(suite)),
    delete: (id) => suites.delete(id),
  };
}

export function createLocalSuiteGateway(): SuiteGateway {
  const read = (): RegressionSuite[] => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(SUITES_STORAGE_KEY) ?? '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isRegressionSuite).map(cloneSuite);
    } catch {
      return [];
    }
  };
  const write = (suites: RegressionSuite[]) => localStorage.setItem(SUITES_STORAGE_KEY, JSON.stringify(suites));
  return {
    list: read,
    get: (id) => read().find((suite) => suite.id === id),
    save: (suite) => write([...read().filter((item) => item.id !== suite.id), cloneSuite(suite)]),
    delete: (id) => write(read().filter((suite) => suite.id !== id)),
  };
}

function isOutcome(value: unknown): value is SuiteOutcome {
  return value === 'passed' || value === 'failed';
}

function isRegressionSuite(value: unknown): value is RegressionSuite {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && typeof record.name === 'string' &&
    typeof record.createdAt === 'string' && typeof record.updatedAt === 'string' &&
    Array.isArray(record.members) && record.members.every((member) => {
      if (typeof member !== 'object' || member === null) return false;
      const item = member as Record<string, unknown>;
      return typeof item.runId === 'string' && isOutcome(item.originalOutcome);
    });
}

export function outcomeFromRun(run: FuzzingRun): SuiteOutcome {
  return run.status === 'failed' ? 'failed' : 'passed';
}

export function createSuite(
  id: string,
  name: string,
  runs: readonly FuzzingRun[],
  now = new Date().toISOString(),
): RegressionSuite {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Suite name is required');
  if (runs.length === 0) throw new Error('A suite must contain at least one run');
  const members = runs.map((run) => ({ runId: run.id, originalOutcome: outcomeFromRun(run) }));
  return { id, name: trimmedName, members, createdAt: now, updatedAt: now };
}

export function validateSuite(suite: RegressionSuite): void {
  if (!suite.id || !suite.name.trim()) throw new Error('Suite ID and name are required');
  if (suite.members.length === 0) throw new Error('A suite must contain at least one run');
  if (suite.members.some((member) => !member.runId || !isOutcome(member.originalOutcome))) {
    throw new Error('Suite members must reference a run and include an outcome snapshot');
  }
}

export function saveSuite(gateway: SuiteGateway, suite: RegressionSuite): void {
  validateSuite(suite);
  gateway.save(suite);
}

export function compareOutcomes(original: SuiteOutcome, current: SuiteOutcome): MatrixStatus {
  if (original === 'failed' && current === 'passed') return 'regressed-fix';
  if (original === 'passed' && current === 'failed') return 'regression';
  return current;
}

export interface ReplayResult {
  outcome: SuiteOutcome;
  run?: FuzzingRun;
}

export type ReplayRunner = (run: FuzzingRun) => Promise<ReplayResult>;

export function deterministicMockReplay(outcomes: Readonly<Record<string, SuiteOutcome>>): ReplayRunner {
  return async (run) => ({ outcome: outcomes[run.id] ?? outcomeFromRun(run), run });
}

export async function executeSuite(
  suite: RegressionSuite,
  resolveRun: (runId: string) => FuzzingRun | undefined,
  replay: ReplayRunner,
): Promise<MatrixResult[]> {
  const results: MatrixResult[] = [];
  for (const member of suite.members) {
    const run = resolveRun(member.runId);
    if (!run) {
      results.push({ runId: member.runId, originalOutcome: member.originalOutcome, status: 'never-ran', error: 'Run not found' });
      continue;
    }
    try {
      const current = await replay(run);
      results.push({
        runId: member.runId,
        originalOutcome: member.originalOutcome,
        currentOutcome: current.outcome,
        status: compareOutcomes(member.originalOutcome, current.outcome),
        currentRun: current.run,
        originalRun: run,
      });
    } catch (error) {
      results.push({ runId: member.runId, originalOutcome: member.originalOutcome, status: 'never-ran', error: error instanceof Error ? error.message : 'Replay failed', originalRun: run });
    }
  }
  return results;
}

export type MatrixFilter = 'all' | MatrixStatus;

export function filterMatrix(results: readonly MatrixResult[], filter: MatrixFilter): MatrixResult[] {
  return filter === 'all' ? [...results] : results.filter((result) => result.status === filter);
}

export function escapeCsvField(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function buildMatrixCsv(results: readonly MatrixResult[]): string {
  const headers = ['Run ID', 'Original Outcome', 'Current Outcome', 'Status', 'Error'];
  const rows = results.map((result) => [result.runId, result.originalOutcome, result.currentOutcome ?? '', result.status, result.error ?? '']);
  return [headers, ...rows].map((row) => row.map((value) => escapeCsvField(value)).join(',')).join('\r\n');
}

// Kept for compatibility with the earlier demo page's utility consumers.
export type RegressionTestStatus = 'pass' | 'fail' | 'skip' | 'running';
export interface RegressionTest { id: string; name: string; description: string; category: string; status: RegressionTestStatus; duration?: number; errorMessage?: string; timestamp: string }
export function calculateSuiteStats(suite: { tests: RegressionTest[] }) { const total = suite.tests.length; const passed = suite.tests.filter((test) => test.status === 'pass').length; const failed = suite.tests.filter((test) => test.status === 'fail').length; const skipped = suite.tests.filter((test) => test.status === 'skip').length; const running = suite.tests.filter((test) => test.status === 'running').length; return { total, passed, failed, skipped, running, passRate: total ? passed / total * 100 : 0 }; }
export function groupTestsByCategory(tests: RegressionTest[]): Record<string, RegressionTest[]> { return tests.reduce<Record<string, RegressionTest[]>>((groups, test) => { (groups[test.category] ??= []).push(test); return groups; }, {}); }
export function formatDuration(ms: number): string { return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`; }
export type RunStatusForSuite = RunStatus;
