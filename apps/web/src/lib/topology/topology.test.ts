import * as assert from 'node:assert/strict';
import { applyFilters, failurePropagation, normalizeFrame, redactFrame, toGeoJson, toTopologyJson } from './normalize';
import { cellSizeForZoom, clusterNodes, project, unlocatedNodes } from './clustering';
import { assignLayers, layoutTopology } from './layout';

const frame = normalizeFrame({
  t: 1000,
  nodes: [
    { id: 'rpc-1', kind: 'rpc', region: 'eu', network: 'testnet', health: 'degraded', lat: 52.5, lon: 13.4, metrics: { latencyMs: 300, crashRate: 5 } },
    { id: 'run-a', kind: 'runner', region: 'eu', lat: 52.6, lon: 13.5, metrics: { runVolume: 40, crashRate: 0.2 } },
    { id: 'run-b', kind: 'runner', region: 'us', lat: 40.7, lon: -74, health: 'down' },
    { id: 'contract', kind: 'contract', region: 'us' },
    { id: 'bad-coord', kind: 'runner', lat: 999, lon: 10 },
    { id: 'run-a', kind: 'runner' },
    { id: '' },
  ],
  edges: [
    { from: 'run-a', to: 'rpc-1', traffic: 50, failureRate: 0.4 },
    { from: 'run-b', to: 'rpc-1', traffic: 10, failureRate: 0.01 },
    { from: 'rpc-1', to: 'contract', traffic: 30, failureRate: 0.2 },
    { from: 'run-a', to: 'ghost' },
    { from: 'run-a', to: 'run-a' },
    { from: 'run-a', to: 'rpc-1', traffic: 1 },
  ],
});

// Normalization: invalid ids/duplicates/edges dropped, metrics clamped, bad coords nulled.
assert.deepEqual(frame.nodes.map((n) => n.id), ['bad-coord', 'contract', 'rpc-1', 'run-a', 'run-b']);
assert.equal(frame.edges.length, 3);
assert.equal(frame.nodes.find((n) => n.id === 'rpc-1')!.metrics.crashRate, 1);
const bad = frame.nodes.find((n) => n.id === 'bad-coord')!;
assert.equal(bad.lat, null);
assert.equal(bad.lon, null);

// Filters keep only edges between surviving nodes.
const eu = applyFilters(frame, { regions: ['eu'] });
assert.deepEqual(eu.nodes.map((n) => n.id), ['rpc-1', 'run-a']);
assert.equal(eu.edges.length, 1);

// Failure propagation follows direction and ignores quiet edges.
assert.deepEqual(Array.from(failurePropagation(frame, 'run-a')).sort(), ['contract', 'rpc-1']);
assert.deepEqual(Array.from(failurePropagation(frame, 'run-b')), []);

// Clustering is deterministic, merges close nodes at low zoom and splits at high zoom.
const low = clusterNodes(frame.nodes, 2, 'crashRate');
const high = clusterNodes(frame.nodes, 10, 'crashRate');
assert.deepEqual(low, clusterNodes(frame.nodes, 2, 'crashRate'));
assert.ok(low.length < high.length);
const berlin = low.find((c) => c.nodeIds.includes('run-a'))!;
assert.deepEqual(berlin.nodeIds, ['rpc-1', 'run-a']);
assert.equal(berlin.health, 'degraded');
assert.ok(cellSizeForZoom(5) < cellSizeForZoom(2));
assert.deepEqual(unlocatedNodes(frame.nodes).map((n) => n.id), ['bad-coord', 'contract']);
assert.deepEqual(project(0, 0, 360, 180), { x: 180, y: 90 });

// 10k+ points stay cheap.
{
  const many = Array.from({ length: 12_000 }, (_, i) => ({
    ...frame.nodes[0], id: `n${i}`, lat: ((i * 7) % 170) - 85, lon: ((i * 13) % 350) - 175,
  }));
  const t = Date.now();
  const clusters = clusterNodes(many, 3, 'latencyMs');
  assert.ok(Date.now() - t < 500);
  assert.ok(clusters.length < many.length);
  assert.equal(clusters.reduce((s, c) => s + c.count, 0), many.length);
}

// Layout is deterministic and orders callers before dependencies.
const layers = assignLayers(frame.nodes, frame.edges);
assert.ok((layers.get('run-a') as number) < (layers.get('rpc-1') as number));
assert.ok((layers.get('rpc-1') as number) < (layers.get('contract') as number));
const a = layoutTopology(frame.nodes, frame.edges, { width: 800, height: 400 });
const b = layoutTopology([...frame.nodes].reverse(), [...frame.edges].reverse(), { width: 800, height: 400 });
assert.deepEqual(a, b);
// Cycles terminate.
const cyc = normalizeFrame({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }] });
assert.equal(layoutTopology(cyc.nodes, cyc.edges, { width: 100, height: 100 }).length, 2);

// Privacy + export.
const red = redactFrame(frame, { coordinateDecimals: 0, maskLabels: true });
assert.equal(red.nodes.find((n) => n.id === 'run-a')!.lat, 53);
assert.ok(red.nodes.every((n) => /^(runner|rpc|contract|dependency)-\d+$/.test(n.label)));
const geo = toGeoJson(frame) as { features: Array<{ geometry: { coordinates: number[] } }> };
assert.equal(geo.features.length, 3);
assert.deepEqual(geo.features[0].geometry.coordinates, [13.4, 52.5]);
assert.equal(JSON.parse(toTopologyJson(frame)).nodes.length, 5);

console.log('topology lib: all tests passed');
