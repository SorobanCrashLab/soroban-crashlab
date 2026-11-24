/**
 * Server-side browse query for the artifact explorer (#2342).
 *
 * Filters, sorting and pagination all happen on the server so the client
 * never holds the full catalog. Cursors are bound to the filter fingerprint:
 * replaying a cursor against different filters is rejected rather than
 * silently skipping or repeating rows.
 */

import { z } from 'zod';
import { assessIntegrity, type TrustLevel } from './integrity';
import { ARTIFACT_TYPES, STORAGE_BACKENDS, type ManagedArtifact } from './model';

export const MAX_PAGE_SIZE = 100;

const isoDate = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)), 'must be an ISO date')
  .optional();

export const browseQuerySchema = z
  .object({
    backend: z.enum(STORAGE_BACKENDS).optional(),
    type: z.enum(ARTIFACT_TYPES).optional(),
    campaign: z.string().max(80).optional(),
    run: z.string().max(80).optional(),
    tag: z.string().max(40).optional(),
    q: z.string().max(120).optional(),
    integrity: z.enum(['trusted', 'warning', 'blocked']).optional(),
    sensitivity: z.enum(['public', 'internal', 'restricted']).optional(),
    from: isoDate,
    to: isoDate,
    minSize: z.coerce.number().int().min(0).optional(),
    maxSize: z.coerce.number().int().min(0).optional(),
    sort: z.enum(['createdAt', 'sizeBytes', 'name']).default('createdAt'),
    dir: z.enum(['asc', 'desc']).default('desc'),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(25),
    cursor: z.string().max(200).optional(),
  })
  .strict();

export type BrowseQuery = z.infer<typeof browseQuerySchema>;

export function parseBrowseQuery(
  params: URLSearchParams,
): { ok: true; query: BrowseQuery } | { ok: false; errors: string[] } {
  const raw: Record<string, string> = {};
  params.forEach((value, key) => {
    if (value !== '') raw[key] = value;
  });
  const parsed = browseQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'query'}: ${issue.message}`) };
  }
  return { ok: true, query: parsed.data };
}

function filterFingerprint(query: BrowseQuery): string {
  const { cursor: _cursor, limit: _limit, ...filters } = query;
  return JSON.stringify(Object.keys(filters).sort().map((key) => [key, filters[key as keyof typeof filters]]));
}

function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) h = Math.imul(h ^ text.charCodeAt(index), 0x01000193) >>> 0;
  return h.toString(36);
}

export function encodeCursor(offset: number, query: BrowseQuery): string {
  return Buffer.from(JSON.stringify({ o: offset, f: hashText(filterFingerprint(query)) })).toString('base64url');
}

export class CursorMismatch extends Error {}

export function decodeCursor(cursor: string | undefined, query: BrowseQuery): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { o?: unknown; f?: unknown };
    if (typeof parsed.o !== 'number' || parsed.o < 0 || !Number.isInteger(parsed.o)) throw new CursorMismatch('Malformed cursor.');
    if (parsed.f !== hashText(filterFingerprint(query))) throw new CursorMismatch('Cursor was issued for different filters.');
    return parsed.o;
  } catch (error) {
    if (error instanceof CursorMismatch) throw error;
    throw new CursorMismatch('Malformed cursor.');
  }
}

export function matchesBrowseQuery(artifact: ManagedArtifact, query: BrowseQuery, trust?: TrustLevel): boolean {
  if (query.backend && artifact.backend !== query.backend) return false;
  if (query.type && artifact.type !== query.type) return false;
  if (query.campaign && artifact.campaignId !== query.campaign) return false;
  if (query.run && artifact.runId !== query.run) return false;
  if (query.tag && !artifact.tags.includes(query.tag)) return false;
  if (query.sensitivity && artifact.sensitivity !== query.sensitivity) return false;
  if (query.q) {
    const term = query.q.toLowerCase();
    if (!artifact.name.toLowerCase().includes(term) && !artifact.id.toLowerCase().includes(term)) return false;
  }
  const created = Date.parse(artifact.createdAt);
  if (query.from && created < Date.parse(query.from)) return false;
  if (query.to && created > Date.parse(query.to)) return false;
  if (query.minSize !== undefined && artifact.sizeBytes < query.minSize) return false;
  if (query.maxSize !== undefined && artifact.sizeBytes > query.maxSize) return false;
  if (query.integrity && (trust ?? assessIntegrity(artifact).level) !== query.integrity) return false;
  return true;
}

export interface BrowseFacets {
  backend: Record<string, number>;
  type: Record<string, number>;
  integrity: Record<TrustLevel, number>;
}

export interface BrowseResult {
  items: Array<ManagedArtifact & { trust: TrustLevel }>;
  total: number;
  nextCursor: string | null;
  facets: BrowseFacets;
}

export function browseArtifacts(catalog: readonly ManagedArtifact[], query: BrowseQuery): BrowseResult {
  const offset = decodeCursor(query.cursor, query);
  const facets: BrowseFacets = { backend: {}, type: {}, integrity: { trusted: 0, warning: 0, blocked: 0 } };
  const matched: Array<ManagedArtifact & { trust: TrustLevel }> = [];
  for (const artifact of catalog) {
    const trust = assessIntegrity(artifact).level;
    if (!matchesBrowseQuery(artifact, query, trust)) continue;
    matched.push({ ...artifact, trust });
    facets.backend[artifact.backend] = (facets.backend[artifact.backend] ?? 0) + 1;
    facets.type[artifact.type] = (facets.type[artifact.type] ?? 0) + 1;
    facets.integrity[trust] += 1;
  }
  const direction = query.dir === 'asc' ? 1 : -1;
  matched.sort((a, b) => {
    const delta =
      query.sort === 'sizeBytes'
        ? a.sizeBytes - b.sizeBytes
        : query.sort === 'name'
          ? a.name.localeCompare(b.name)
          : Date.parse(a.createdAt) - Date.parse(b.createdAt);
    return delta !== 0 ? delta * direction : a.id.localeCompare(b.id);
  });
  const items = matched.slice(offset, offset + query.limit);
  const next = offset + items.length;
  return {
    items,
    total: matched.length,
    nextCursor: next < matched.length ? encodeCursor(next, query) : null,
    facets,
  };
}
