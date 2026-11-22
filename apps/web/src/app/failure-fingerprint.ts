/**
 * Failure-signature fingerprinting with similarity-based cluster merging
 * (issue #1419).
 *
 * Normalises crash signatures by stripping variable parts (addresses, hex
 * offsets, line shifts) and produces a stable hash + token-component list so
 * that trivially-different frames collapse into the same semantic group.
 *
 * Design principle: **precision over recall** — bad merges poison triage
 * trust, so the normaliser is conservative.  Rejected aggressive rules are
 * listed at the bottom of this file.
 */

import * as crypto from 'node:crypto';

/* ------------------------------------------------------------------ */
/*  Normalised fingerprint                                             */
/* ------------------------------------------------------------------ */

export interface Fingerprint {
  /** Stable hex hash of the normalised signature. */
  hash: string;
  /** Ordered, de-duplicated component tokens of the normalised signature. */
  components: string[];
  /** The normalised signature string (for display/debug). */
  normalised: string;
}

/* ------------------------------------------------------------------ */
/*  Normalisation rules                                                */
/* ------------------------------------------------------------------ */

/**
 * Strip hex-encoded addresses of 4+ hex chars.
 * Examples: `0x1a2b3c4d`, `0xDEADBEEF` → `<ADDR>`
 */
const ADDRESS_RE = /\b0x[0-9a-fA-F]{4,}\b/g;

/**
 * Strip hex-encoded line/col offsets following a `+` (e.g. `+0x1a2b`).
 */
const HEX_OFFSET_RE = /\+0x[0-9a-fA-F]+\b/g;

/**
 * Strip trailing line/col numbers after a path segment (`file.rs:42:10` →
 * `file.rs`).  Only matches when preceded by a filename-like token.
 */
const LINE_COL_RE = /\.\w+:\d+:\d+/g;

/**
 * Strip bare numeric suffixes that look like line numbers (`:42`, `:999`).
 */
const BARE_LINE_RE = /:\d{1,6}\b(?![\w])/g;

/**
 * Normalise whitespace: trim, collapse runs, lowercase.
 */
function normaliseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Apply the full normalisation pipeline to a raw signature string.
 * The pipeline is order-sensitive and intentionally conservative.
 */
export function normaliseSignature(raw: string): string {
  let s = raw;
  // Process hex offsets before addresses so that +0x1a2b is captured as
  // an offset rather than having 0x1a2b stripped as a standalone address.
  s = s.replace(HEX_OFFSET_RE, '+<OFFSET>');
  s = s.replace(ADDRESS_RE, '<ADDR>');
  s = s.replace(LINE_COL_RE, (match) => {
    // Keep the filename portion, strip :line:col
    const idx = match.lastIndexOf(':');
    const withoutCol = match.slice(0, idx);
    const idx2 = withoutCol.lastIndexOf(':');
    return withoutCol.slice(0, idx2);
  });
  s = s.replace(BARE_LINE_RE, '');
  s = normaliseWhitespace(s);
  return s;
}

/* ------------------------------------------------------------------ */
/*  Fingerprint creation                                               */
/* ------------------------------------------------------------------ */

/**
 * Tokenise a normalised signature into a sorted, de-duplicated component
 * list.  Tokens are split on common delimiters (`:`, `/`, `_`, `-`, space)
 * and empty tokens are dropped.
 */
export function tokenise(normalised: string): string[] {
  const raw = normalised.split(/[:/\-_\s]+/).filter(Boolean);
  // De-duplicate while preserving first-occurrence order, then sort for
  // canonical comparison.
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const t of raw) {
    if (!seen.has(t)) {
      seen.add(t);
      unique.push(t);
    }
  }
  return unique.sort();
}

/**
 * Create a fingerprint from a raw crash signature.
 *
 * Pure, deterministic, and fast — suitable for hot paths.
 */
export function fingerprint(rawSignature: string): Fingerprint {
  const normalised = normaliseSignature(rawSignature);
  const components = tokenise(normalised);
  const hash = crypto
    .createHash('sha256')
    .update(components.join('\0'))
    .digest('hex');
  return { hash, components, normalised };
}

/* ------------------------------------------------------------------ */
/*  Similarity scoring                                                 */
/* ------------------------------------------------------------------ */

/**
 * Jaccard similarity between two component sets (0.0 – 1.0).
 *
 * Two identical fingerprints return 1.0; completely disjoint sets return 0.0.
 */
export function similarity(a: Fingerprint, b: Fingerprint): number {
  const setA = new Set(a.components);
  const setB = new Set(b.components);
  let intersection = 0;
  for (const c of setA) {
    if (setB.has(c)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/* ------------------------------------------------------------------ */
/*  Clustering helpers                                                 */
/* ------------------------------------------------------------------ */

/**
 * Bucket a list of raw signatures by their fingerprint hash.
 * Returns a Map from hash → raw signatures that share that fingerprint.
 */
export function bucketByFingerprint(
  signatures: string[],
): Map<string, string[]> {
  const buckets = new Map<string, string[]>();
  for (const sig of signatures) {
    const fp = fingerprint(sig);
    const existing = buckets.get(fp.hash);
    if (existing) {
      existing.push(sig);
    } else {
      buckets.set(fp.hash, [sig]);
    }
  }
  return buckets;
}

/**
 * Find clusters that should be merged based on a similarity threshold.
 * Returns pairs of bucket hashes that exceed the threshold.
 */
export function findSimilarPairs(
  buckets: Map<string, string[]>,
  threshold: number,
): Array<[string, string]> {
  const hashes = Array.from(buckets.keys());
  const fpCache = new Map<string, Fingerprint>();
  const getFp = (hash: string): Fingerprint => {
    let fp = fpCache.get(hash);
    if (!fp) {
      // Reconstruct from the first signature in the bucket.
      const sigs = buckets.get(hash)!;
      fp = fingerprint(sigs[0]);
      fpCache.set(hash, fp);
    }
    return fp;
  };

  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < hashes.length; i++) {
    for (let j = i + 1; j < hashes.length; j++) {
      const sim = similarity(getFp(hashes[i]), getFp(hashes[j]));
      if (sim >= threshold) {
        pairs.push([hashes[i], hashes[j]]);
      }
    }
  }
  return pairs;
}

/**
 * Union-find helper for merging similar buckets.
 */
export class UnionFind {
  private parent: Map<string, string> = new Map();
  private rank: Map<string, number> = new Map();

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)!));
    }
    return this.parent.get(x)!;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    const rankA = this.rank.get(ra)!;
    const rankB = this.rank.get(rb)!;
    if (rankA < rankB) {
      this.parent.set(ra, rb);
    } else if (rankA > rankB) {
      this.parent.set(rb, ra);
    } else {
      this.parent.set(rb, ra);
      this.rank.set(ra, rankA + 1);
    }
  }
}

/*
 * Normalisation rules NOT applied (conservative defaults):
 *
 * 1. **Frame order-insensitive canonicalisation** — we sort tokens but do NOT
 *    treat frame sets as unordered bags.  Two signatures whose frame order
 *    differs only because of re-ordering in the stack are not collapsed; this
 *    is intentional because execution order can be semantically meaningful in
 *    Soroban contract traps.
 *
 * 2. **Numeric constant collapsing** — small integer literals (e.g. `1`,
 *    `42`, `0`) are NOT stripped because they often encode meaningful limits
 *    or error codes.
 *
 * 3. **Substring / fuzzy matching** — no edit-distance or n-gram similarity;
 *    only exact token overlap (Jaccard).  This keeps the scoring
 *    deterministic and fast.
 */
