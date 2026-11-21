import { safeStorage } from './local-storage';

const LABS_STORAGE_KEY = 'onboarding-labs-progress';

export type LabRole = 'contributor' | 'maintainer' | 'security-researcher' | 'auditor';

export type LabArea = 'rust-engine' | 'fuzz-workflows' | 'frontend-analysis' | 'triage';

export type LabDifficulty = 'beginner' | 'intermediate' | 'advanced';

export interface LabTraceEvent {
  t: number;
  kind: 'log' | 'crash' | 'trace' | 'coverage';
  message: string;
  signature?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

export interface LabSeedRun {
  seed: number;
  outcome: 'pass' | 'crash' | 'timeout';
  signature?: string;
  area?: LabArea;
  durationMs: number;
}

export interface LabStep {
  id: string;
  title: string;
  instruction: string;
  hint?: string;
}

export interface LabMilestone {
  id: string;
  title: string;
  description: string;
  condition: (progress: LabProgress, labs: Readonly<Lab[]>) => boolean;
}

export interface Lab {
  id: string;
  role: LabRole;
  area: LabArea;
  title: string;
  description: string;
  difficulty: LabDifficulty;
  estimatedMinutes: number;
  steps: LabStep[];
  seededRuns: LabSeedRun[];
  traces: LabTraceEvent[];
  milestoneId: string;
}

export interface LabProgress {
  role: LabRole | null;
  completedLabIds: string[];
  completedStepIds: string[];
  startedAt: string;
  lastActivityAt: string;
}

export interface LearningPath {
  role: LabRole;
  title: string;
  description: string;
  labIds: string[];
}

const STEPS_TOKEN = (labId: string, stepId: string) => `${labId}:${stepId}`;

export const LABS: Lab[] = [
  {
    id: 'first-crash-triage',
    role: 'contributor',
    area: 'triage',
    title: 'First Crash Triage',
    description: 'Reproduce and classify a seeded invariant violation from a real campaign trace.',
    difficulty: 'beginner',
    estimatedMinutes: 8,
    steps: [
      {
        id: 'open-sandbox',
        title: 'Open the crash sandbox',
        instruction: 'Inspect the seeded campaign run and locate the failing seed and its signature.',
        hint: 'Look for runs with outcome "crash" in the sandbox table.',
      },
      {
        id: 'read-trace',
        title: 'Read the execution trace',
        instruction: 'Open the trace viewer and find the host call that triggered the trap.',
        hint: 'Trace events mark the failing call with severity "critical".',
      },
      {
        id: 'classify',
        title: 'Classify the failure',
        instruction: 'Match the crash signature to the failure area and confirm the triage decision.',
        hint: 'The signature prefix maps to the fuzz-workflow area.',
      },
    ],
    seededRuns: [
      { seed: 1001, outcome: 'pass', area: 'triage', durationMs: 42 },
      { seed: 1002, outcome: 'crash', signature: 'sig:token:transfer:assert_balance_nonnegative', area: 'triage', durationMs: 118 },
      { seed: 1003, outcome: 'pass', area: 'triage', durationMs: 39 },
      { seed: 1004, outcome: 'timeout', area: 'triage', durationMs: 5000 },
      { seed: 1005, outcome: 'crash', signature: 'sig:token:transfer:assert_balance_nonnegative', area: 'triage', durationMs: 124 },
    ],
    traces: [
      { t: 0, kind: 'log', message: 'campaign started · token::transfer × 64 seeds' },
      { t: 1, kind: 'log', message: 'mutating amounts · edge: u64::MAX' },
      { t: 2, kind: 'log', message: 'dictionary insert · from/to auth pairs' },
      { t: 3, kind: 'trace', message: 'host call require_auth(from) → ok', severity: 'low' },
      { t: 4, kind: 'trace', message: 'host call transfer(amount=u64::MAX) → trap: arithmetic overflow', severity: 'critical', signature: 'sig:token:transfer:assert_balance_nonnegative' },
      { t: 5, kind: 'crash', message: 'crash: InvariantViolation · signatureHash=sig:token:transfer:assert_balance_nonnegative', signature: 'sig:token:transfer:assert_balance_nonnegative', severity: 'high' },
      { t: 6, kind: 'coverage', message: 'coverage 71% · dedup by signatureHash · 1 group' },
    ],
    milestoneId: 'first-crash-triage',
  },
  {
    id: 'reproducer-lab',
    role: 'contributor',
    area: 'fuzz-workflows',
    title: 'Reproducer Lab',
    description: 'Shrink a crashing seed to a minimal reproducer while preserving the failure signature.',
    difficulty: 'beginner',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'locate-crash',
        title: 'Locate the crashing seed',
        instruction: 'Find seed 4042 in the sandbox and note its crash signature.',
      },
      {
        id: 'shrink',
        title: 'Shrink the payload',
        instruction: 'Remove non-essential fields from the seed payload until only the crashing input remains.',
        hint: 'The signature must stay identical after each removal.',
      },
      {
        id: 'verify',
        title: 'Verify the reproducer',
        instruction: 'Re-run the shrunk seed and confirm the same signature reappears.',
      },
    ],
    seededRuns: [
      { seed: 4041, outcome: 'pass', area: 'fuzz-workflows', durationMs: 35 },
      { seed: 4042, outcome: 'crash', signature: 'sig:contract:call:recursion_depth_exceeded', area: 'fuzz-workflows', durationMs: 210 },
      { seed: 4043, outcome: 'pass', area: 'fuzz-workflows', durationMs: 33 },
      { seed: 4044, outcome: 'crash', signature: 'sig:contract:call:recursion_depth_exceeded', area: 'fuzz-workflows', durationMs: 205 },
    ],
    traces: [
      { t: 0, kind: 'log', message: 'seed 4042 · contract::call with depth chain' },
      { t: 1, kind: 'trace', message: 'host call invoke(contract=A, fn=step) → depth 1', severity: 'low' },
      { t: 2, kind: 'trace', message: 'host call invoke(contract=A, fn=step) → depth 2', severity: 'low' },
      { t: 3, kind: 'trace', message: 'host call invoke(contract=A, fn=step) → trap: recursion depth exceeded', severity: 'critical', signature: 'sig:contract:call:recursion_depth_exceeded' },
      { t: 4, kind: 'crash', message: 'crash: RecursionDepthExceeded · signatureHash=sig:contract:call:recursion_depth_exceeded', signature: 'sig:contract:call:recursion_depth_exceeded', severity: 'high' },
    ],
    milestoneId: 'first-reproducer',
  },
  {
    id: 'budget-exhaustion-lab',
    role: 'contributor',
    area: 'rust-engine',
    title: 'Budget Exhaustion',
    description: 'Identify a seed engineered at the metering boundary that exhausts the CPU instruction budget.',
    difficulty: 'intermediate',
    estimatedMinutes: 12,
    steps: [
      {
        id: 'scan',
        title: 'Scan for timeouts',
        instruction: 'Filter the sandbox runs by "timeout" outcome and inspect the longest-running seed.',
        hint: 'Timeout seeds cluster near the budget exhaustion boundary.',
      },
      {
        id: 'correlate',
        title: 'Correlate with telemetry',
        instruction: 'Match the timeout seed to the coverage frame where execs-per-second plateaued.',
      },
      {
        id: 'triage',
        title: 'Classify as budget exhaustion',
        instruction: 'Record the failure area as rust-engine with severity high.',
      },
    ],
    seededRuns: [
      { seed: 7001, outcome: 'pass', area: 'rust-engine', durationMs: 51 },
      { seed: 7002, outcome: 'timeout', area: 'rust-engine', durationMs: 5000 },
      { seed: 7003, outcome: 'pass', area: 'rust-engine', durationMs: 47 },
      { seed: 7004, outcome: 'timeout', area: 'rust-engine', durationMs: 5000 },
      { seed: 7005, outcome: 'pass', area: 'rust-engine', durationMs: 49 },
    ],
    traces: [
      { t: 0, kind: 'log', message: 'campaign started · budget=1e6 instructions' },
      { t: 1, kind: 'log', message: 'mutating loops · edge: unbounded iteration' },
      { t: 2, kind: 'trace', message: 'host call iterate(n=1e9) → budget remaining 94%', severity: 'low' },
      { t: 3, kind: 'trace', message: 'host call iterate(n=1e9) → budget remaining 12%', severity: 'medium' },
      { t: 4, kind: 'trace', message: 'host call iterate(n=1e9) → trap: CPU budget exhausted', severity: 'critical' },
      { t: 5, kind: 'crash', message: 'crash: BudgetExhausted · signatureHash=sig:engine:budget:cpu_exhaustion', severity: 'high' },
    ],
    milestoneId: 'first-budget-exhaustion',
  },
  {
    id: 'auth-matrix-lab',
    role: 'maintainer',
    area: 'fuzz-workflows',
    title: 'Auth Matrix Fuzzing',
    description: 'Exercise authorization across contract state transitions and surface require_auth divergence.',
    difficulty: 'intermediate',
    estimatedMinutes: 15,
    steps: [
      {
        id: 'setup',
        title: 'Set up stateful sequence',
        instruction: 'Initialize two identities in the sandbox: caller (authorized) and attacker (unauthorized).',
      },
      {
        id: 'transition',
        title: 'Drive state transitions',
        instruction: 'Execute the set_admin → transfer → revoke chain and observe each require_auth outcome.',
      },
      {
        id: 'divergence',
        title: 'Surface auth divergence',
        instruction: 'Identify the transition where the attacker succeeded and record the signature.',
      },
    ],
    seededRuns: [
      { seed: 9001, outcome: 'pass', area: 'fuzz-workflows', durationMs: 61 },
      { seed: 9002, outcome: 'crash', signature: 'sig:auth:require_auth:unauthorized_admin_write', area: 'fuzz-workflows', durationMs: 140 },
      { seed: 9003, outcome: 'pass', area: 'fuzz-workflows', durationMs: 58 },
    ],
    traces: [
      { t: 0, kind: 'log', message: 'auth sequence: set_admin → transfer → revoke' },
      { t: 1, kind: 'trace', message: 'host call require_auth(admin) → ok', severity: 'low' },
      { t: 2, kind: 'trace', message: 'host call require_auth(attacker) → denied', severity: 'medium' },
      { t: 3, kind: 'trace', message: 'host call require_auth(attacker) → ok · state divergence', severity: 'critical', signature: 'sig:auth:require_auth:unauthorized_admin_write' },
      { t: 4, kind: 'crash', message: 'crash: AuthDivergence · signatureHash=sig:auth:require_auth:unauthorized_admin_write', signature: 'sig:auth:require_auth:unauthorized_admin_write', severity: 'critical' },
    ],
    milestoneId: 'first-auth-divergence',
  },
  {
    id: 'frontend-analysis-lab',
    role: 'auditor',
    area: 'frontend-analysis',
    title: 'Frontend Analysis Tools',
    description: 'Use trace clustering, signature grouping, and trend views to triage a multi-signature campaign.',
    difficulty: 'advanced',
    estimatedMinutes: 18,
    steps: [
      {
        id: 'cluster',
        title: 'Cluster crashes by signature',
        instruction: 'Group the sandbox crashes by signatureHash and identify the dominant group.',
      },
      {
        id: 'trend',
        title: 'Inspect the failure trend',
        instruction: 'Open the trend view and confirm when each signature first appeared.',
      },
      {
        id: 'report',
        title: 'File a triage report',
        instruction: 'Export the cluster summary with exemplars for the maintainer queue.',
      },
    ],
    seededRuns: [
      { seed: 5001, outcome: 'crash', signature: 'sig:token:transfer:assert_balance_nonnegative', area: 'frontend-analysis', durationMs: 110 },
      { seed: 5002, outcome: 'crash', signature: 'sig:token:transfer:assert_balance_nonnegative', area: 'frontend-analysis', durationMs: 115 },
      { seed: 5003, outcome: 'crash', signature: 'sig:contract:call:recursion_depth_exceeded', area: 'frontend-analysis', durationMs: 200 },
      { seed: 5004, outcome: 'pass', area: 'frontend-analysis', durationMs: 40 },
    ],
    traces: [
      { t: 0, kind: 'log', message: 'multi-signature campaign · 4 seeds · 3 crashes' },
      { t: 1, kind: 'trace', message: 'cluster A: sig:token:transfer:assert_balance_nonnegative × 2', severity: 'high' },
      { t: 2, kind: 'trace', message: 'cluster B: sig:contract:call:recursion_depth_exceeded × 1', severity: 'high' },
      { t: 3, kind: 'trace', message: 'trend: cluster A first seen at t=1, cluster B at t=2', severity: 'low' },
    ],
    milestoneId: 'first-cluster-report',
  },
  {
    id: 'regression-lab',
    role: 'maintainer',
    area: 'rust-engine',
    title: 'Regression Verification',
    description: 'Replay a stored failure bundle and confirm the fix eliminated the signature.',
    difficulty: 'advanced',
    estimatedMinutes: 14,
    steps: [
      {
        id: 'replay',
        title: 'Replay the failing bundle',
        instruction: 'Replay seed 8001 against the patched engine build in the sandbox.',
      },
      {
        id: 'compare',
        title: 'Compare signatures',
        instruction: 'Confirm the replay no longer emits sig:engine:budget:cpu_exhaustion.',
      },
      {
        id: 'land',
        title: 'Land the regression',
        instruction: 'Mark the regression as fixed and attach the replay trace to the issue.',
      },
    ],
    seededRuns: [
      { seed: 8001, outcome: 'crash', signature: 'sig:engine:budget:cpu_exhaustion', area: 'rust-engine', durationMs: 5000 },
      { seed: 8002, outcome: 'pass', area: 'rust-engine', durationMs: 55 },
      { seed: 8003, outcome: 'pass', area: 'rust-engine', durationMs: 52 },
    ],
    traces: [
      { t: 0, kind: 'log', message: 'replay seed 8001 against patched build' },
      { t: 1, kind: 'trace', message: 'host call iterate(n=1e9) → completed within budget', severity: 'low' },
      { t: 2, kind: 'trace', message: 'signature sig:engine:budget:cpu_exhaustion no longer emitted', severity: 'low' },
      { t: 3, kind: 'log', message: 'regression verified · 0 crashes across 3 replays', severity: 'low' },
    ],
    milestoneId: 'first-regression',
  },
];

export const MILESTONES: LabMilestone[] = [
  {
    id: 'first-crash-triage',
    title: 'First Crash Triage',
    description: 'Triaged your first seeded crash in the sandbox.',
    condition: (progress) => progress.completedLabIds.includes('first-crash-triage'),
  },
  {
    id: 'first-reproducer',
    title: 'First Reproducer',
    description: 'Shrunk a crashing seed into a minimal reproducer.',
    condition: (progress) => progress.completedLabIds.includes('reproducer-lab'),
  },
  {
    id: 'first-budget-exhaustion',
    title: 'Budget Exhaustion',
    description: 'Identified a metering-boundary timeout seed.',
    condition: (progress) => progress.completedLabIds.includes('budget-exhaustion-lab'),
  },
  {
    id: 'first-auth-divergence',
    title: 'Auth Divergence',
    description: 'Surfaced a require_auth divergence across a state transition.',
    condition: (progress) => progress.completedLabIds.includes('auth-matrix-lab'),
  },
  {
    id: 'first-cluster-report',
    title: 'Cluster Report',
    description: 'Grouped crashes by signature and filed a triage report.',
    condition: (progress) => progress.completedLabIds.includes('frontend-analysis-lab'),
  },
  {
    id: 'first-regression',
    title: 'First Regression',
    description: 'Verified a fix by replaying a stored failure bundle.',
    condition: (progress) => progress.completedLabIds.includes('regression-lab'),
  },
  {
    id: 'all-labs',
    title: 'Guided Labs Complete',
    description: 'Completed every guided lab in your learning path.',
    condition: (progress, labs) => labs.every((lab) => progress.completedLabIds.includes(lab.id)),
  },
];

export const LEARNING_PATHS: Record<LabRole, LearningPath> = {
  contributor: {
    role: 'contributor',
    title: 'Contributor Path',
    description: 'Crash triage, reproducers, and budget-exhaustion fuzzing for new contributors.',
    labIds: ['first-crash-triage', 'reproducer-lab', 'budget-exhaustion-lab'],
  },
  maintainer: {
    role: 'maintainer',
    title: 'Maintainer Path',
    description: 'Auth-matrix fuzzing and regression verification for repository maintainers.',
    labIds: ['auth-matrix-lab', 'regression-lab', 'first-crash-triage'],
  },
  'security-researcher': {
    role: 'security-researcher',
    title: 'Security Researcher Path',
    description: 'Auth divergence and fault-injection fuzzing for security researchers.',
    labIds: ['auth-matrix-lab', 'budget-exhaustion-lab', 'reproducer-lab'],
  },
  auditor: {
    role: 'auditor',
    title: 'Auditor Path',
    description: 'Signature clustering and frontend analysis triage for auditors.',
    labIds: ['frontend-analysis-lab', 'first-crash-triage', 'reproducer-lab'],
  },
};

const nowISO = () => new Date().toISOString();

const defaultProgress: LabProgress = {
  role: null,
  completedLabIds: [],
  completedStepIds: [],
  startedAt: nowISO(),
  lastActivityAt: nowISO(),
};

export function loadLabProgress(): LabProgress {
  const stored = safeStorage.getJson<LabProgress>(LABS_STORAGE_KEY);
  if (stored) {
    return {
      role: stored.role ?? null,
      completedLabIds: Array.isArray(stored.completedLabIds) ? stored.completedLabIds : [],
      completedStepIds: Array.isArray(stored.completedStepIds) ? stored.completedStepIds : [],
      startedAt: typeof stored.startedAt === 'string' ? stored.startedAt : nowISO(),
      lastActivityAt: typeof stored.lastActivityAt === 'string' ? stored.lastActivityAt : nowISO(),
    };
  }
  return { ...defaultProgress, startedAt: nowISO(), lastActivityAt: nowISO() };
}

export function saveLabProgress(progress: LabProgress): void {
  safeStorage.setJson(LABS_STORAGE_KEY, {
    ...progress,
    lastActivityAt: nowISO(),
  });
}

export function completeLabStep(labId: string, stepId: string): LabProgress {
  const progress = loadLabProgress();
  const token = STEPS_TOKEN(labId, stepId);
  if (!progress.completedStepIds.includes(token)) {
    progress.completedStepIds.push(token);
    saveLabProgress(progress);
  }
  return progress;
}

export function completeLab(labId: string): LabProgress {
  const progress = loadLabProgress();
  if (!progress.completedLabIds.includes(labId)) {
    progress.completedLabIds.push(labId);
    saveLabProgress(progress);
  }
  return progress;
}

export function setLearningPathRole(role: LabRole): LabProgress {
  const progress = loadLabProgress();
  progress.role = role;
  saveLabProgress(progress);
  return progress;
}

export function labById(labId: string): Lab | undefined {
  return LABS.find((lab) => lab.id === labId);
}

export function labsForRole(role: LabRole): Lab[] {
  return LABS.filter((lab) => lab.role === role || lab.role === 'contributor');
}

export function learningPathLabs(role: LabRole): Lab[] {
  const path = LEARNING_PATHS[role];
  if (!path) return [];
  return path.labIds.map((id) => labById(id)).filter((lab): lab is Lab => Boolean(lab));
}

export function achievedMilestones(progress: LabProgress, labs: Readonly<Lab[]> = LABS): LabMilestone[] {
  return MILESTONES.filter((m) => m.condition(progress, labs));
}

export function progressPercentage(progress: LabProgress, labs: Readonly<Lab[]> = LABS): number {
  if (labs.length === 0) return 0;
  const completed = labs.filter((lab) => progress.completedLabIds.includes(lab.id)).length;
  return Math.round((completed / labs.length) * 100);
}

export function stepCompletionCount(progress: LabProgress): number {
  return progress.completedStepIds.length;
}

export function isLabComplete(progress: LabProgress, labId: string): boolean {
  return progress.completedLabIds.includes(labId);
}

export function isStepComplete(progress: LabProgress, labId: string, stepId: string): boolean {
  return progress.completedStepIds.includes(STEPS_TOKEN(labId, stepId));
}
