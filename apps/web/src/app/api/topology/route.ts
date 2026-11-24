/**
 * GET /api/topology?frames=N&privacy=standard|strict
 *
 * Returns time-ordered topology frames. Data is generated deterministically
 * until the backend telemetry service is wired in (same approach as the other
 * demo routes). `privacy=strict` (the default for unauthenticated callers)
 * coarsens coordinates and masks node labels - infrastructure locations are
 * sensitive. `privacy=standard` requires the `x-crashlab-role: maintainer` header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { normalizeFrame, redactFrame, type TopologyFrame } from '@/lib/topology/normalize';

const SITES = [
  { region: 'us-east', lat: 40.7, lon: -74.0 },
  { region: 'us-west', lat: 37.8, lon: -122.4 },
  { region: 'eu-central', lat: 50.1, lon: 8.7 },
  { region: 'eu-west', lat: 53.3, lon: -6.3 },
  { region: 'ap-south', lat: 19.1, lon: 72.9 },
  { region: 'ap-northeast', lat: 35.7, lon: 139.7 },
];

/** Small deterministic PRNG so the same request always yields the same data. */
function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildFrames(count: number, endMs: number): TopologyFrame[] {
  const frames: TopologyFrame[] = [];
  for (let f = 0; f < count; f += 1) {
    const rand = mulberry(1337 + f);
    const incident = f >= Math.floor(count * 0.6); // an anomaly emerges late in the window
    const nodes: Array<Record<string, unknown>> = [];
    const edges: Array<Record<string, unknown>> = [];

    nodes.push({ id: 'contract-main', label: 'Main contract', kind: 'contract', region: 'global', network: 'testnet' });
    SITES.forEach((site, i) => {
      const rpcId = `rpc-${site.region}`;
      const bad = incident && i === 2;
      nodes.push({
        id: rpcId, label: `RPC ${site.region}`, kind: 'rpc', region: site.region, network: 'testnet',
        health: bad ? 'down' : rand() > 0.9 ? 'degraded' : 'healthy', lat: site.lat, lon: site.lon,
        metrics: { runVolume: 0, crashRate: 0, latencyMs: bad ? 1800 : 80 + rand() * 120, budgetExhaustion: 0, queueDepth: Math.round(rand() * 20) },
      });
      edges.push({ from: rpcId, to: 'contract-main', traffic: 100 + rand() * 50, failureRate: bad ? 0.7 : rand() * 0.04 });
      for (let r = 0; r < 4; r += 1) {
        const id = `runner-${site.region}-${r}`;
        const affected = incident && i === 2;
        nodes.push({
          id, label: `Runner ${site.region}/${r}`, kind: 'runner', region: site.region, network: 'testnet',
          health: affected && r % 2 === 0 ? 'degraded' : 'healthy',
          lat: site.lat + (rand() - 0.5) * 2, lon: site.lon + (rand() - 0.5) * 2,
          metrics: { runVolume: 200 + rand() * 300, crashRate: affected ? 0.25 + rand() * 0.3 : rand() * 0.05, latencyMs: 40 + rand() * 60, budgetExhaustion: rand() * 0.3, queueDepth: Math.round(rand() * 40) },
        });
        edges.push({ from: id, to: rpcId, traffic: 20 + rand() * 30, failureRate: affected ? 0.3 + rand() * 0.2 : rand() * 0.03 });
      }
    });
    frames.push(normalizeFrame({ t: endMs - (count - 1 - f) * 60_000, nodes, edges }));
  }
  return frames;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const count = Math.min(Math.max(parseInt(params.get('frames') ?? '12', 10) || 12, 1), 120);
  const wantsStandard = params.get('privacy') === 'standard';
  const allowed = request.headers.get('x-crashlab-role') === 'maintainer';
  const strict = !(wantsStandard && allowed);
  const frames = buildFrames(count, Date.now()).map((f) => (strict ? redactFrame(f, { coordinateDecimals: 0, maskLabels: true }) : f));
  return NextResponse.json({ privacy: strict ? 'strict' : 'standard', frames });
}
