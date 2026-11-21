/*
 * Deterministic sample change set for the Unified Diff Review Workbench (#1880).
 *
 * The page ships with one representative review so every renderer, the impact
 * summary and the policy gates have something real to show without a backend.
 * Everything is generated from fixed inputs so repeat visits render identically.
 */

import type { ArtifactChange, ChangeSet, ReviewComment } from './types';

/** Reviewer the workbench records decisions as by default. */
export const DEFAULT_ACTOR_ID = 'rv-alice';

const CONTRACT_ID = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQAHHAGCN4B2';

const CREATED_AT = '2026-05-04T09:12:00.000Z';
const COMMENT_TIME = '2026-05-04T10:05:00.000Z';
const APPROVAL_TIME = '2026-05-04T10:41:00.000Z';

/** Encodes readable text as even-length hex, the trace wire format. */
function bytesToHex(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i += 1) out += text.charCodeAt(i).toString(16).padStart(2, '0');
  return out;
}

/** Encodes a number as an 8-byte big-endian hex string so it decodes as an int. */
function intToHex(value: number): string {
  return BigInt.asUintN(64, BigInt(value)).toString(16).padStart(16, '0');
}

const FUZZ_CONFIG_BEFORE = `[harness]
seed_count = 5000
workers = 4
timeout_ms = 2500

[corpus]
roots = ["corpus/token", "corpus/amm"]
max_depth = 6

[reporting]
emit_state_diff = false
emit_trace = true`;

const FUZZ_CONFIG_AFTER = `[harness]
seed_count = 8000
workers = 8
timeout_ms = 1800

[corpus]
roots = ["corpus/token", "corpus/amm", "corpus/router"]
max_depth = 6

[reporting]
emit_state_diff = true
emit_trace = true`;

const BLUEPRINT_BEFORE = `{
  "name": "token-transfer",
  "version": 2,
  "limits": { "max_ops": 12, "max_bytes": 4096 },
  "auth": { "mode": "sourceAccount", "required": false },
  "steps": ["transfer", "settle"]
}`;

const BLUEPRINT_AFTER = `{
  "name": "token-transfer",
  "version": 3,
  "limits": { "max_ops": 16, "max_bytes": 4096 },
  "auth": { "mode": "sourceAccount", "required": true },
  "steps": ["transfer", "settle", "audit"]
}`;

const SNAPSHOT_BEFORE = `{
  "width": 1280,
  "height": 720,
  "regions": [
    { "id": "header", "label": "Header", "x": 0, "y": 0, "width": 1280, "height": 72, "hash": "a1b2c3d4" },
    { "id": "panel-fees", "label": "Fee panel", "x": 24, "y": 96, "width": 400, "height": 240, "hash": "bb11cc22" },
    { "id": "panel-runs", "label": "Run list", "x": 448, "y": 96, "width": 808, "height": 480, "hash": "de998877" },
    { "id": "footer", "label": "Legend", "x": 0, "y": 660, "width": 1280, "height": 60, "hash": "feed0001" }
  ]
}`;

const SNAPSHOT_AFTER = `{
  "width": 1280,
  "height": 720,
  "regions": [
    { "id": "header", "label": "Header", "x": 0, "y": 0, "width": 1280, "height": 72, "hash": "a1b2c3d4" },
    { "id": "panel-fees", "label": "Fee panel", "x": 24, "y": 96, "width": 400, "height": 240, "hash": "bb11cc99" },
    { "id": "panel-runs", "label": "Run list", "x": 448, "y": 96, "width": 808, "height": 480, "hash": "de998877" },
    { "id": "panel-replay", "label": "Replay panel", "x": 24, "y": 360, "width": 400, "height": 240, "hash": "11223344" }
  ]
}`;

function semanticEntry(key: string, value: string): string {
  return `    { "contractId": "${CONTRACT_ID}", "key": "${bytesToHex(key)}", "type": "contract_data", "value": "${value}" }`;
}

const TRACE_BEFORE = `[
${semanticEntry('DataKey::Balance', intToHex(1000))},
${semanticEntry('DataKey::Admin', bytesToHex('admin'))},
${semanticEntry('DataKey::Temp', bytesToHex('scratch-1'))}
]`;

const TRACE_AFTER = `[
${semanticEntry('DataKey::Balance', intToHex(1250))},
${semanticEntry('DataKey::Admin', bytesToHex('admin'))},
${semanticEntry('DataKey::Owner', bytesToHex('new-owner'))}
]`;

const ARTIFACTS: ArtifactChange[] = [
  {
    descriptor: {
      id: 'cfg-fuzz',
      label: 'Fuzz harness config',
      path: 'configs/fuzz.toml',
      kind: 'text',
      format: 'toml',
    },
    before: FUZZ_CONFIG_BEFORE,
    after: FUZZ_CONFIG_AFTER,
    owner: 'platform-team',
  },
  {
    descriptor: {
      id: 'bp-token',
      label: 'Token transfer blueprint',
      path: 'blueprints/token-transfer.json',
      kind: 'structured',
      format: 'json',
    },
    before: BLUEPRINT_BEFORE,
    after: BLUEPRINT_AFTER,
    owner: 'contracts-team',
  },
  {
    descriptor: {
      id: 'snap-dashboard',
      label: 'Dashboard frame',
      path: 'snapshots/dashboard-frame.regions.json',
      kind: 'snapshot',
      format: 'png',
    },
    before: SNAPSHOT_BEFORE,
    after: SNAPSHOT_AFTER,
    owner: 'design-systems',
  },
  {
    descriptor: {
      id: 'trace-4821',
      label: 'Run 4821 state',
      path: 'traces/run-4821.state.json',
      kind: 'semantic',
      format: 'trace',
    },
    before: TRACE_BEFORE,
    after: TRACE_AFTER,
    owner: 'runtime-team',
  },
];

const COMMENTS: ReviewComment[] = [
  {
    id: 'c-1',
    artifactId: 'cfg-fuzz',
    anchor: 'text-0',
    author: 'rv-alice',
    body:
      'Raising seed_count to 8000 doubles the fast lane runtime. Keep 5000 for the fast lane and use 8000 only in the nightly profile.',
    severity: 'blocking',
    suggestion: 'seed_count = 5000',
    createdAt: COMMENT_TIME,
    resolved: false,
  },
  {
    id: 'c-2',
    artifactId: 'bp-token',
    anchor: 'limits.max_ops',
    author: 'rv-bob',
    body: 'The max_ops bump is fine, but please record it in the blueprint changelog so the limit move is auditable.',
    severity: 'advisory',
    suggestion: null,
    createdAt: COMMENT_TIME,
    resolved: false,
  },
  {
    id: 'c-3',
    artifactId: 'snap-dashboard',
    anchor: 'panel-fees',
    author: 'rv-carol',
    body: 'Fee panel re-render matches the new palette. Verified against the canvas artifact.',
    severity: 'advisory',
    suggestion: null,
    createdAt: COMMENT_TIME,
    resolved: true,
  },
];

/** Builds a fresh sample change set. Returns new objects on every call. */
export function buildSampleChangeSet(): ChangeSet {
  return {
    id: 'cs-sprint42-harness',
    title: 'Sprint 42 fuzz harness revamp',
    description:
      'Raises throughput on the fuzz harness, widens the corpus, promotes state diffs into the default report, and refreshes the dashboard snapshot.',
    author: 'rv-you',
    createdAt: CREATED_AT,
    links: [
      { id: 'l-ci', kind: 'ci', label: 'CI build 4821', href: '/integrations/ci-replay' },
      { id: 'l-incident', kind: 'incident', label: 'INC-219', href: '/incidents/inc-219' },
      { id: 'l-release', kind: 'release', label: 'release/1.9.0', href: '/help/changelog' },
      { id: 'l-canvas', kind: 'canvas', label: 'Canvas: token flow', href: '/runs/run-4821' },
      { id: 'l-report', kind: 'report', label: 'Report: sprint 42 delta', href: '/analytics' },
    ],
    artifacts: ARTIFACTS.map((artifact) => ({
      ...artifact,
      descriptor: { ...artifact.descriptor },
    })),
    reviewers: [
      { id: 'rv-you', name: 'You', role: 'author' },
      { id: 'rv-alice', name: 'Alice Nguyen', role: 'approver' },
      { id: 'rv-bob', name: 'Bob Ito', role: 'reviewer' },
      { id: 'rv-carol', name: 'Carol Diaz', role: 'approver' },
    ],
    comments: COMMENTS.map((comment) => ({ ...comment })),
    approvals: [
      {
        reviewerId: 'rv-carol',
        decision: 'approved',
        note: 'Snapshot verified against the canvas.',
        at: APPROVAL_TIME,
      },
    ],
    state: 'changes_requested',
    requiredApprovals: 2,
    ciStatus: 'passing',
  };
}
