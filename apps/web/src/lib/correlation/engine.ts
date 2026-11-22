/**
 * Correlation engine (#2304): suggestions with confidence and rationale, a
 * confirm/reject feedback loop, graph traversal, and permission-aware export.
 */

import { pairKey, type CorrelationArtifact, type CorrelationLink, type InvestigationSet, type SignalKind } from './model';
import { BASE_WEIGHTS, combineConfidence, signalsBetween, type SignalWeights } from './scoring';

export const MIN_CONFIDENCE = 0.3;
const MIN_FACTOR = 0.2;
const MAX_FACTOR = 1.2;

export interface SuggestOptions {
  weights?: SignalWeights;
  minConfidence?: number;
  limit?: number;
  /** Links already decided by a human; confirmed pairs are skipped, rejected pairs never resurface. */
  existing?: CorrelationLink[];
  /** Restrict suggestions to pairs involving this artifact. */
  focusId?: string;
}

/** Deterministic: identical inputs always yield identical ordering. */
export function suggestLinks(artifacts: CorrelationArtifact[], options: SuggestOptions = {}): CorrelationLink[] {
  const weights = options.weights ?? BASE_WEIGHTS;
  const min = options.minConfidence ?? MIN_CONFIDENCE;
  const decided = new Set((options.existing ?? []).filter((l) => l.status !== 'suggested').map((l) => pairKey(l.from, l.to)));
  const sorted = artifacts.slice().sort((a, b) => a.id.localeCompare(b.id));
  const out: CorrelationLink[] = [];

  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const a = sorted[i];
      const b = sorted[j];
      if (options.focusId && a.id !== options.focusId && b.id !== options.focusId) continue;
      if (a.workspace !== b.workspace || decided.has(pairKey(a.id, b.id))) continue;
      const signals = signalsBetween(a, b, weights);
      if (!signals.length) continue;
      const confidence = combineConfidence(signals.map((s) => s.weight));
      if (confidence < min) continue;
      out.push({
        id: `sug:${pairKey(a.id, b.id)}`,
        from: a.id,
        to: b.id,
        source: 'suggested',
        status: 'suggested',
        confidence,
        rationale: signals.map((s) => s.reason),
        signals: signals.map((s) => s.kind),
        createdBy: 'engine',
        createdAt: new Date(0).toISOString(),
      });
    }
  }
  out.sort((x, y) => y.confidence - x.confidence || x.id.localeCompare(y.id));
  return options.limit ? out.slice(0, options.limit) : out;
}

/**
 * Feedback loop: signals that keep producing rejected links lose weight;
 * signals behind confirmed links gain weight. Bounded so no signal vanishes
 * or dominates.
 */
export function learnWeights(links: CorrelationLink[], base: SignalWeights = BASE_WEIGHTS): SignalWeights {
  const factor: Record<SignalKind, number> = { run_id: 1, trace_id: 1, content_hash: 1, signature: 1, commit_env: 1, time_proximity: 1 };
  for (const link of links) {
    if (link.signals.length === 0) continue;
    const step = link.status === 'confirmed' ? 1.05 : link.status === 'rejected' ? 0.9 : 1;
    for (const s of link.signals) factor[s] = Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, factor[s] * step));
  }
  const next = { ...base };
  (Object.keys(next) as SignalKind[]).forEach((k) => {
    next[k] = Math.min(1, Number((base[k] * factor[k]).toFixed(4)));
  });
  return next;
}

export function decide(link: CorrelationLink, status: 'confirmed' | 'rejected', actor: string, now: Date = new Date()): CorrelationLink {
  return { ...link, status, source: link.source, createdBy: link.createdBy === 'engine' ? actor : link.createdBy, createdAt: link.createdAt === new Date(0).toISOString() ? now.toISOString() : link.createdAt };
}

export function manualLink(from: string, to: string, actor: string, now: Date = new Date()): CorrelationLink {
  return {
    id: `man:${pairKey(from, to)}`,
    from,
    to,
    source: 'manual',
    status: 'confirmed',
    confidence: 1,
    rationale: [`linked manually by ${actor}`],
    signals: [],
    createdBy: actor,
    createdAt: now.toISOString(),
  };
}

/** Artifacts connected to `startId` through non-rejected links, with hop distance. */
export function neighborhood(links: CorrelationLink[], startId: string, maxHops = 3): Map<string, number> {
  const adj = new Map<string, string[]>();
  for (const l of links) {
    if (l.status === 'rejected') continue;
    adj.set(l.from, [...(adj.get(l.from) ?? []), l.to]);
    adj.set(l.to, [...(adj.get(l.to) ?? []), l.from]);
  }
  const dist = new Map<string, number>([[startId, 0]]);
  const queue = [startId];
  while (queue.length) {
    const cur = queue.shift() as string;
    const d = dist.get(cur) as number;
    if (d >= maxHops) continue;
    for (const next of (adj.get(cur) ?? []).slice().sort()) {
      if (!dist.has(next)) {
        dist.set(next, d + 1);
        queue.push(next);
      }
    }
  }
  return dist;
}

export interface AccessContext {
  workspaces: string[];
  canSeeRestricted: boolean;
}

/** Permission-aware view: unreadable artifacts are dropped, restricted ones are redacted. */
export function redactForAccess(artifacts: CorrelationArtifact[], access: AccessContext): CorrelationArtifact[] {
  return artifacts
    .filter((a) => access.workspaces.includes(a.workspace))
    .map((a) =>
      a.restricted && !access.canSeeRestricted
        ? { id: a.id, type: a.type, title: '[restricted]', timestamp: a.timestamp, workspace: a.workspace, restricted: true }
        : a,
    );
}

/** Shareable evidence bundle for an investigation set; respects access control. */
export function buildEvidenceBundle(
  set: InvestigationSet,
  artifacts: CorrelationArtifact[],
  links: CorrelationLink[],
  access: AccessContext,
) {
  const ids = new Set(set.artifactIds);
  const visible = redactForAccess(artifacts.filter((a) => ids.has(a.id)), access);
  const visibleIds = new Set(visible.map((a) => a.id));
  return {
    set: { id: set.id, name: set.name, tags: set.tags },
    artifacts: visible.sort((a, b) => a.id.localeCompare(b.id)),
    links: links
      .filter((l) => set.linkIds.includes(l.id) && l.status !== 'rejected' && visibleIds.has(l.from) && visibleIds.has(l.to))
      .sort((a, b) => a.id.localeCompare(b.id)),
    omitted: ids.size - visible.length,
  };
}

export function searchLinks(
  links: CorrelationLink[],
  artifacts: CorrelationArtifact[],
  filter: { types?: string[]; minConfidence?: number; from?: number; to?: number; status?: string[] },
): CorrelationLink[] {
  const byId = new Map(artifacts.map((a) => [a.id, a]));
  return links.filter((l) => {
    const a = byId.get(l.from);
    const b = byId.get(l.to);
    if (!a || !b) return false;
    if (filter.types?.length && !(filter.types.includes(a.type) || filter.types.includes(b.type))) return false;
    if (filter.minConfidence !== undefined && l.confidence < filter.minConfidence) return false;
    if (filter.status?.length && !filter.status.includes(l.status)) return false;
    const t = Math.max(a.timestamp, b.timestamp);
    if (filter.from !== undefined && t < filter.from) return false;
    if (filter.to !== undefined && t > filter.to) return false;
    return true;
  });
}
