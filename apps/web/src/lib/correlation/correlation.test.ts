import * as assert from 'node:assert/strict';
import type { CorrelationArtifact, CorrelationLink, InvestigationSet } from './model';
import { combineConfidence, signalsBetween } from './scoring';
import { buildEvidenceBundle, decide, learnWeights, manualLink, neighborhood, redactForAccess, searchLinks, suggestLinks } from './engine';

const T = 1_700_000_000_000;
const A = (o: Partial<CorrelationArtifact> & { id: string; type: CorrelationArtifact['type'] }): CorrelationArtifact => ({
  title: o.id, timestamp: T, workspace: 'ws', ...o,
});

const artifacts = [
  A({ id: 'run-1', type: 'run', signature: 'panic:oob', commit: 'abcdef123', env: 'ci' }),
  A({ id: 'trace-9', type: 'trace', runId: 'run-1', timestamp: T + 5_000 }),
  A({ id: 'log-4', type: 'log', runId: 'run-1', signature: 'panic:oob', timestamp: T + 2_000 }),
  A({ id: 'repro-2', type: 'reproducer', contentHash: 'deadbeefdeadbeef', timestamp: T + 100_000 }),
  A({ id: 'art-7', type: 'artifact', contentHash: 'deadbeefdeadbeef', timestamp: T + 200_000 }),
  A({ id: 'run-2', type: 'run', commit: 'abcdef123', env: 'ci', timestamp: T + 900_000 }),
  A({ id: 'other-ws', type: 'log', runId: 'run-1', workspace: 'other' }),
  A({ id: 'secret', type: 'state_diff', runId: 'run-1', restricted: true, title: 'prod keys' }),
];

// Noisy-OR combination is bounded and monotonic.
assert.equal(combineConfidence([]), 0);
assert.ok(combineConfidence([0.5, 0.5]) === 0.75);
assert.ok(combineConfidence([0.9, 0.9, 0.9]) < 1);

// Signals: run ids (including implicit ones) and corroborating time proximity.
const sig = signalsBetween(artifacts[0], artifacts[1]);
assert.deepEqual(sig.map((s) => s.kind).sort(), ['run_id', 'time_proximity']);
assert.ok(signalsBetween(artifacts[1], artifacts[5]).length === 0);

// Suggestions: ranked, explained, deterministic, workspace-scoped.
const sug = suggestLinks(artifacts);
assert.deepEqual(sug, suggestLinks([...artifacts].reverse()));
assert.ok(sug.every((l) => l.rationale.length > 0 && l.confidence >= 0.3));
assert.ok(sug.every((l) => l.from !== 'other-ws' && l.to !== 'other-ws'));
for (let i = 1; i < sug.length; i += 1) assert.ok(sug[i - 1].confidence >= sug[i].confidence);
const hashLink = sug.find((l) => l.id === 'sug:art-7|repro-2')!;
assert.ok(hashLink.confidence >= 0.95);
assert.ok(hashLink.rationale[0].includes('content hash'));
assert.equal(suggestLinks(artifacts, { focusId: 'run-2' }).every((l) => l.from === 'run-2' || l.to === 'run-2'), true);
assert.ok(suggestLinks(artifacts, { limit: 2 }).length === 2);

// Decisions suppress re-suggestion; rejected pairs never resurface.
const rejected = decide(hashLink, 'rejected', 'alice');
assert.equal(rejected.status, 'rejected');
assert.ok(!suggestLinks(artifacts, { existing: [rejected] }).some((l) => l.id === hashLink.id));
assert.ok(!suggestLinks(artifacts, { existing: [manualLink('run-1', 'trace-9', 'bob')] }).some((l) => l.id === 'sug:run-1|trace-9'));

// Feedback loop adjusts weights within bounds.
const manyRejected: CorrelationLink[] = Array.from({ length: 50 }, () => ({ ...rejected, signals: ['signature'] }));
const w = learnWeights(manyRejected);
assert.ok(w.signature < 0.6 && w.signature >= 0.6 * 0.2 - 1e-9);
assert.equal(w.run_id, 0.9);
const w2 = learnWeights(Array.from({ length: 50 }, () => ({ ...rejected, status: 'confirmed' as const, signals: ['commit_env' as const] })));
assert.ok(w2.commit_env > 0.35 && w2.commit_env <= 0.35 * 1.2 + 1e-9);

// Graph traversal ignores rejected links and respects hop limits.
const links = [manualLink('run-1', 'trace-9', 'a'), manualLink('trace-9', 'log-4', 'a'), manualLink('log-4', 'repro-2', 'a'), { ...manualLink('run-1', 'run-2', 'a'), status: 'rejected' as const }];
const hood = neighborhood(links, 'run-1', 2);
assert.equal(hood.get('log-4'), 2);
assert.ok(!hood.has('repro-2'));
assert.ok(!hood.has('run-2'));

// Permissions: redaction + bundle omits what the viewer cannot see.
const viewer = { workspaces: ['ws'], canSeeRestricted: false };
const red = redactForAccess(artifacts, viewer);
assert.ok(!red.some((a) => a.id === 'other-ws'));
assert.equal(red.find((a) => a.id === 'secret')!.title, '[restricted]');
assert.equal(red.find((a) => a.id === 'secret')!.runId, undefined);
const set: InvestigationSet = { id: 's1', name: 'Crash 42', artifactIds: ['run-1', 'secret', 'other-ws'], linkIds: ['man:run-1|secret'], tags: [], createdBy: 'a', createdAt: '' };
const bundle = buildEvidenceBundle(set, artifacts, [manualLink('run-1', 'secret', 'a')], viewer);
assert.equal(bundle.omitted, 1);
assert.equal(bundle.artifacts.length, 2);
assert.equal(buildEvidenceBundle(set, artifacts, [manualLink('run-1', 'secret', 'a')], { workspaces: ['ws'], canSeeRestricted: true }).artifacts.find((a) => a.id === 'secret')!.title, 'prod keys');

// Search filters.
assert.ok(searchLinks(sug, artifacts, { types: ['reproducer'] }).every((l) => l.from === 'repro-2' || l.to === 'repro-2'));
assert.ok(searchLinks(sug, artifacts, { minConfidence: 0.9 }).every((l) => l.confidence >= 0.9));

console.log('correlation lib: all tests passed');
