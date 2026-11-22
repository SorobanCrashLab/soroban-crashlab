/**
 * Topology data model + normalization (#2303).
 *
 * Raw API payloads are coerced into a strict shape: invalid coordinates are
 * dropped (the node stays in the topology view), duplicate ids are merged, and
 * metrics are clamped so downstream overlays never see NaN.
 */

export type NodeKind = 'runner' | 'rpc' | 'contract' | 'dependency';
export type Health = 'healthy' | 'degraded' | 'down';

export const METRIC_LAYERS = ['runVolume', 'crashRate', 'latencyMs', 'budgetExhaustion', 'queueDepth'] as const;
export type MetricLayer = (typeof METRIC_LAYERS)[number];

export const METRIC_LABELS: Record<MetricLayer, string> = {
  runVolume: 'Run volume',
  crashRate: 'Crash rate',
  latencyMs: 'Latency (ms)',
  budgetExhaustion: 'Budget exhaustion',
  queueDepth: 'Queue depth',
};

export type Metrics = Record<MetricLayer, number>;

export interface TopoNode {
  id: string;
  label: string;
  kind: NodeKind;
  region: string;
  network: string;
  health: Health;
  lat: number | null;
  lon: number | null;
  metrics: Metrics;
}

export interface TopoEdge {
  from: string;
  to: string;
  /** Traffic (requests/min) along the edge. */
  traffic: number;
  /** 0..1 share of requests failing along the edge. */
  failureRate: number;
}

export interface TopologyFrame {
  /** Epoch ms of the snapshot. */
  t: number;
  nodes: TopoNode[];
  edges: TopoEdge[];
}

const KINDS: NodeKind[] = ['runner', 'rpc', 'contract', 'dependency'];
const HEALTH: Health[] = ['healthy', 'degraded', 'down'];

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function coordinate(v: unknown, limit: number): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

export function normalizeNode(raw: Record<string, unknown>): TopoNode | null {
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id) return null;
  const m = (raw.metrics ?? {}) as Record<string, unknown>;
  const lat = coordinate(raw.lat, 90);
  const lon = coordinate(raw.lon, 180);
  return {
    id,
    label: typeof raw.label === 'string' && raw.label ? raw.label : id,
    kind: KINDS.includes(raw.kind as NodeKind) ? (raw.kind as NodeKind) : 'runner',
    region: typeof raw.region === 'string' && raw.region ? raw.region : 'unknown',
    network: typeof raw.network === 'string' && raw.network ? raw.network : 'default',
    health: HEALTH.includes(raw.health as Health) ? (raw.health as Health) : 'healthy',
    // Both or neither: a half-valid coordinate is useless on a map.
    lat: lat !== null && lon !== null ? lat : null,
    lon: lat !== null && lon !== null ? lon : null,
    metrics: {
      runVolume: Math.max(0, num(m.runVolume)),
      crashRate: Math.min(1, Math.max(0, num(m.crashRate))),
      latencyMs: Math.max(0, num(m.latencyMs)),
      budgetExhaustion: Math.min(1, Math.max(0, num(m.budgetExhaustion))),
      queueDepth: Math.max(0, num(m.queueDepth)),
    },
  };
}

export function normalizeFrame(raw: { t?: unknown; nodes?: unknown; edges?: unknown }): TopologyFrame {
  const byId = new Map<string, TopoNode>();
  for (const r of Array.isArray(raw.nodes) ? raw.nodes : []) {
    const node = normalizeNode((r ?? {}) as Record<string, unknown>);
    if (node && !byId.has(node.id)) byId.set(node.id, node);
  }
  const edges: TopoEdge[] = [];
  const seen = new Set<string>();
  for (const r of Array.isArray(raw.edges) ? raw.edges : []) {
    const e = (r ?? {}) as Record<string, unknown>;
    const from = String(e.from ?? '');
    const to = String(e.to ?? '');
    const key = `${from}->${to}`;
    // Edges must connect known nodes, and self-loops carry no topology information.
    if (!byId.has(from) || !byId.has(to) || from === to || seen.has(key)) continue;
    seen.add(key);
    edges.push({ from, to, traffic: Math.max(0, num(e.traffic)), failureRate: Math.min(1, Math.max(0, num(e.failureRate))) });
  }
  return { t: num(raw.t), nodes: Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id)), edges };
}

export interface TopologyFilters {
  kinds?: NodeKind[];
  regions?: string[];
  networks?: string[];
  health?: Health[];
}

export function applyFilters(frame: TopologyFrame, f: TopologyFilters): TopologyFrame {
  const keep = (n: TopoNode) =>
    (!f.kinds?.length || f.kinds.includes(n.kind)) &&
    (!f.regions?.length || f.regions.includes(n.region)) &&
    (!f.networks?.length || f.networks.includes(n.network)) &&
    (!f.health?.length || f.health.includes(n.health));
  const nodes = frame.nodes.filter(keep);
  const ids = new Set(nodes.map((n) => n.id));
  return { ...frame, nodes, edges: frame.edges.filter((e) => ids.has(e.from) && ids.has(e.to)) };
}

/**
 * Edges whose failures plausibly propagate from `sourceId`: downstream (follows
 * edge direction) reachable nodes via edges with a non-trivial failure rate.
 */
export function failurePropagation(frame: TopologyFrame, sourceId: string, minFailureRate = 0.05): Set<string> {
  const out = new Map<string, string[]>();
  for (const e of frame.edges) {
    if (e.failureRate < minFailureRate) continue;
    out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
  }
  const reached = new Set<string>();
  const queue = [sourceId];
  while (queue.length) {
    const cur = queue.shift() as string;
    for (const next of out.get(cur) ?? []) {
      if (!reached.has(next) && next !== sourceId) {
        reached.add(next);
        queue.push(next);
      }
    }
  }
  return reached;
}

/** Privacy control: coarsen coordinates and optionally mask node labels. */
export function redactFrame(frame: TopologyFrame, opts: { coordinateDecimals: number; maskLabels: boolean }): TopologyFrame {
  const factor = 10 ** Math.max(0, opts.coordinateDecimals);
  const round = (v: number | null) => (v === null ? null : Math.round(v * factor) / factor);
  return {
    ...frame,
    nodes: frame.nodes.map((n, i) => ({
      ...n,
      lat: round(n.lat),
      lon: round(n.lon),
      label: opts.maskLabels ? `${n.kind}-${i + 1}` : n.label,
    })),
  };
}

export function toTopologyJson(frame: TopologyFrame): string {
  return JSON.stringify(frame, null, 2);
}

export function toGeoJson(frame: TopologyFrame): object {
  return {
    type: 'FeatureCollection',
    features: frame.nodes
      .filter((n) => n.lat !== null && n.lon !== null)
      .map((n) => ({
        type: 'Feature',
        // GeoJSON order is [longitude, latitude].
        geometry: { type: 'Point', coordinates: [n.lon, n.lat] },
        properties: { id: n.id, label: n.label, kind: n.kind, region: n.region, network: n.network, health: n.health, ...n.metrics },
      })),
  };
}
