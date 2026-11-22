/**
 * Hierarchical failure clustering for the runs query API (issue #1860).
 *
 * This is the TypeScript mirror of the Rust `crashlab-core::cluster` service.
 * It reduces a flood of raw crash signatures into a small set of triage units
 * using a three-level hierarchy:
 *
 * | Level | Meaning                                                         |
 * |-------|-----------------------------------------------------------------|
 * | L1    | taxonomy class (run area: auth / state / budget / xdr)          |
 * | L2    | normalized signature — volatile parts masked, shape preserved   |
 * | L3    | raw signature variance — the concrete members of a cluster      |
 *
 * Two observations share a cluster iff they share the same L1 class and the
 * same L2 normalized signature. Distinct bugs can never merge.
 *
 * Normalization masks:
 *  - addresses → `Address@<ordinal>` (ordinal by first appearance)
 *  - hashes    → `Hash@<ordinal>`
 *  - amounts   → `i128:1e18-magnitude-bucket` / `u128:…`
 */

/** Version of the shipped normalization rule set. */
export const NORMALIZATION_RULES_VERSION = 1;

/** Version of the taxonomy labels the rules are authored against. */
export const TAXONOMY_VERSION = 1;

/**
 * Default minimum digit count before a *bare* (untagged) integer is treated as
 * an amount. Small integers often encode error codes and are left intact.
 */
export const DEFAULT_AMOUNT_MIN_DIGITS = 7;

export interface NormalizationRules {
  rulesVersion: number;
  taxonomyVersion: number;
  maskAddresses: boolean;
  maskAmounts: boolean;
  maskHashes: boolean;
  amountMinDigits: number;
}

export function defaultNormalizationRules(): NormalizationRules {
  return {
    rulesVersion: NORMALIZATION_RULES_VERSION,
    taxonomyVersion: TAXONOMY_VERSION,
    maskAddresses: true,
    maskAmounts: true,
    maskHashes: true,
    amountMinDigits: DEFAULT_AMOUNT_MIN_DIGITS,
  };
}

export interface NormalizedSignature {
  text: string;
  rulesVersion: number;
}

// 0x-prefixed or bare 32-byte (64 hex char) hashes.
const HASH_RE = /\b(?:0x)?[0-9a-fA-F]{64}\b/g;
// 0x-prefixed 20-byte (40 hex char) addresses, or Stellar strkeys.
const ADDRESS_RE = /\b(?:0x[0-9a-fA-F]{40}|[GC][A-Z2-7]{55})\b/g;
const TYPED_AMOUNT_RE = /\b(i128|u128):(\d+)\b/g;
const BARE_AMOUNT_RE = /\b\d+\b/g;

function maskOrdinals(input: string, re: RegExp, label: string): string {
  const seen = new Map<string, number>();
  let next = 0;
  return input.replace(re, (match) => {
    let ordinal = seen.get(match);
    if (ordinal === undefined) {
      ordinal = next;
      next += 1;
      seen.set(match, ordinal);
    }
    return `${label}@${ordinal}`;
  });
}

function magnitudeBucket(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 0;
  return Math.floor(Math.log10(value));
}

function bucketDigits(prefix: string, digits: string): string {
  const parsed = Number(digits);
  const bucket = magnitudeBucket(parsed);
  return `${prefix}:1e${bucket}-magnitude-bucket`;
}

/**
 * Normalizes a raw signature preimage by masking volatile address, hash, and
 * amount tokens while preserving the structural shape of the signature.
 */
export function normalizeSignaturePreimage(
  raw: string,
  rules: NormalizationRules = defaultNormalizationRules(),
): NormalizedSignature {
  let text = raw;

  if (rules.maskHashes) {
    text = maskOrdinals(text, HASH_RE, 'Hash');
  }
  if (rules.maskAddresses) {
    text = maskOrdinals(text, ADDRESS_RE, 'Address');
  }
  if (rules.maskAmounts) {
    text = text.replace(TYPED_AMOUNT_RE, (_match, prefix: string, digits: string) =>
      bucketDigits(prefix, digits),
    );
    text = text.replace(BARE_AMOUNT_RE, (match) =>
      match.length >= rules.amountMinDigits ? bucketDigits('i128', match) : match,
    );
  }

  return { text, rulesVersion: rules.rulesVersion };
}

export interface FailureObservation {
  /** L1 taxonomy class (run area). */
  taxonomyClass: string;
  /** L3 raw, un-normalized signature preimage. */
  rawSignature: string;
  /** Stable seed identifier. */
  seedId: number;
  /** Payload length of the (possibly shrunk) seed — exemplar selection. */
  seedPayloadLen: number;
  /** Monotonic observation timestamp. */
  observedAt: number;
  /** Optional run id, for drill-down back to a run. */
  runId?: string;
}

export interface ClusterMember {
  seedId: number;
  seedPayloadLen: number;
  rawSignature: string;
  observedAt: number;
  runId?: string;
}

export interface FailureCluster {
  id: string;
  taxonomyClass: string;
  normalizedSignature: string;
  rulesVersion: number;
  count: number;
  exemplarSeedId: number;
  exemplarPayloadLen: number;
  exemplarRawSignature: string;
  /** Run id of the exemplar, when known (exemplar link for the UI). */
  exemplarRunId?: string;
  firstSeen: number;
  lastSeen: number;
  members: ClusterMember[];
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function clusterId(taxonomyClass: string, normalized: string, rulesVersion: number): string {
  return `${taxonomyClass}:${fnv1aHex(`${taxonomyClass}\u0000${normalized}`)}:v${rulesVersion}`;
}

function beatsExemplar(obs: FailureObservation, cluster: FailureCluster): boolean {
  if (obs.seedPayloadLen !== cluster.exemplarPayloadLen) {
    return obs.seedPayloadLen < cluster.exemplarPayloadLen;
  }
  return obs.seedId < cluster.exemplarSeedId;
}

/**
 * Aggregates observations into hierarchical clusters. Ordered by descending
 * count, then ascending normalized signature for deterministic triage.
 */
export function clusterObservations(
  observations: readonly FailureObservation[],
  rules: NormalizationRules = defaultNormalizationRules(),
): FailureCluster[] {
  const clusters = new Map<string, FailureCluster>();

  for (const obs of observations) {
    const normalized = normalizeSignaturePreimage(obs.rawSignature, rules);
    const key = `${obs.taxonomyClass}\u0000${normalized.rulesVersion}\u0000${normalized.text}`;
    const member: ClusterMember = {
      seedId: obs.seedId,
      seedPayloadLen: obs.seedPayloadLen,
      rawSignature: obs.rawSignature,
      observedAt: obs.observedAt,
      ...(obs.runId !== undefined ? { runId: obs.runId } : {}),
    };

    const existing = clusters.get(key);
    if (existing) {
      existing.count += 1;
      existing.firstSeen = Math.min(existing.firstSeen, obs.observedAt);
      existing.lastSeen = Math.max(existing.lastSeen, obs.observedAt);
      if (beatsExemplar(obs, existing)) {
        existing.exemplarSeedId = obs.seedId;
        existing.exemplarPayloadLen = obs.seedPayloadLen;
        existing.exemplarRawSignature = obs.rawSignature;
        existing.exemplarRunId = obs.runId;
      }
      existing.members.push(member);
      continue;
    }

    clusters.set(key, {
      id: clusterId(obs.taxonomyClass, normalized.text, normalized.rulesVersion),
      taxonomyClass: obs.taxonomyClass,
      normalizedSignature: normalized.text,
      rulesVersion: normalized.rulesVersion,
      count: 1,
      exemplarSeedId: obs.seedId,
      exemplarPayloadLen: obs.seedPayloadLen,
      exemplarRawSignature: obs.rawSignature,
      exemplarRunId: obs.runId,
      firstSeen: obs.observedAt,
      lastSeen: obs.observedAt,
      members: [member],
    });
  }

  return Array.from(clusters.values()).sort(
    (a, b) =>
      b.count - a.count ||
      a.normalizedSignature.localeCompare(b.normalizedSignature) ||
      a.taxonomyClass.localeCompare(b.taxonomyClass),
  );
}

function parseNumericSeedId(runId: string): number {
  const digits = runId.replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}

/**
 * Builds a failure observation from a fuzzing run. Failed runs always carry a
 * crash detail; runs without one are ignored by the caller.
 */
function observationFromRun(run: import('@/app/types').FuzzingRun): FailureObservation | null {
  if (run.status !== 'failed' || !run.crashDetail) {
    return null;
  }
  const { failureCategory, signature, payload } = run.crashDetail;
  const observedAt = Date.parse(run.queuedAt ?? run.startedAt ?? '') || 0;
  return {
    taxonomyClass: run.area,
    rawSignature: `${failureCategory}:${signature}:${payload}`,
    seedId: parseNumericSeedId(run.id),
    seedPayloadLen: run.seedCount,
    observedAt,
    runId: run.id,
  };
}

/**
 * Convenience: clusters all failed runs into hierarchical triage units.
 */
export function buildHierarchicalClustersFromRuns(
  runs: readonly import('@/app/types').FuzzingRun[],
  rules: NormalizationRules = defaultNormalizationRules(),
): FailureCluster[] {
  const observations: FailureObservation[] = [];
  for (const run of runs) {
    const obs = observationFromRun(run);
    if (obs) observations.push(obs);
  }
  return clusterObservations(observations, rules);
}

/**
 * Returns the cluster containing the given run, or null when the run is not a
 * failed run with a crash detail.
 */
export function findClusterForRun(
  runs: readonly import('@/app/types').FuzzingRun[],
  runId: string,
  rules: NormalizationRules = defaultNormalizationRules(),
): FailureCluster | null {
  const clusters = buildHierarchicalClustersFromRuns(runs, rules);
  return clusters.find((cluster) => cluster.members.some((m) => m.runId === runId)) ?? null;
}
