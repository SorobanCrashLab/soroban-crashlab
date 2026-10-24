/**
 * lib/triage/store — durable triage queue (#1878).
 *
 * Status and ownership have to survive the request that wrote them: a
 * maintainer assigns an item and reloads the page, and on serverless that can
 * be a different instance. Items therefore live in the record-driver layer
 * (Redis when configured, in-memory otherwise) with an index for enumeration —
 * the same primitives roles and the idempotency store already use.
 *
 * The state machine stays outside: this module never decides whether a move is
 * legal, it only persists the decision and returns the result. That split is
 * why the transitions can be tested with no storage at all.
 */

import { applyBulkTriage, type BulkTriageRequest, type BulkTriageResult } from './bulk';
import type { TriageItemState } from './types';
import { selectRecordDriver, type RecordDriver } from '@/lib/storage/record-driver';

export const TRIAGE_QUEUE_INDEX = 'triage:queue';
const ITEM_PREFIX = 'triage:item:';
const MAX_ITEMS = 5_000;

function itemKey(id: string): string {
  return `${ITEM_PREFIX}${id}`;
}

function parseItem(raw: string): TriageItemState | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = parsed as Partial<TriageItemState>;
    if (typeof candidate.id !== 'string' || typeof candidate.orgId !== 'string') return null;
    if (typeof candidate.signature !== 'string' || typeof candidate.status !== 'string') return null;
    return candidate as TriageItemState;
  } catch {
    // A corrupt record is skipped, not fatal: one bad row must not empty the
    // whole queue.
    return null;
  }
}

const PRIORITY_RANK: Record<TriageItemState['priority'], number> = {
  p0: 0,
  p1: 1,
  p2: 2,
  p3: 3,
};

/** Priority first, then the loudest signature, then id — a total order. */
export function sortQueue(items: readonly TriageItemState[]): TriageItemState[] {
  return [...items].sort((a, b) => {
    const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (byPriority !== 0) return byPriority;
    const byOccurrences = b.occurrences - a.occurrences;
    if (byOccurrences !== 0) return byOccurrences;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export class TriageStore {
  constructor(private readonly driver?: RecordDriver) {}

  private getDriver(): RecordDriver {
    return this.driver ?? selectRecordDriver();
  }

  /** All items, optionally scoped to one organisation. */
  async list(orgId?: string): Promise<TriageItemState[]> {
    const driver = this.getDriver();
    const ids = await driver.listIndex(TRIAGE_QUEUE_INDEX);
    const items: TriageItemState[] = [];

    for (const id of ids.slice(0, MAX_ITEMS)) {
      const raw = await driver.getRecord(itemKey(id));
      if (!raw) continue;
      const item = parseItem(raw);
      if (!item) continue;
      if (orgId !== undefined && item.orgId !== orgId) continue;
      items.push(item);
    }

    return sortQueue(items);
  }

  async get(id: string): Promise<TriageItemState | null> {
    const raw = await this.getDriver().getRecord(itemKey(id));
    return raw ? parseItem(raw) : null;
  }

  /**
   * Writes the given items. Ids come from the caller and are never derived
   * from a signature, so a re-run with the same signature keeps its history.
   */
  async save(items: readonly TriageItemState[]): Promise<void> {
    const driver = this.getDriver();
    for (const item of items.slice(0, MAX_ITEMS)) {
      await driver.putRecord(itemKey(item.id), JSON.stringify(item));
      await driver.addToIndex(TRIAGE_QUEUE_INDEX, item.id);
    }
  }

  /**
   * Inserts seed items that are not present yet. Existing rows are left alone,
   * so restarting the server (or running the smoke test) never resets a
   * maintainer's assignments.
   */
  async seed(items: readonly TriageItemState[]): Promise<number> {
    const driver = this.getDriver();
    let inserted = 0;
    for (const item of items.slice(0, MAX_ITEMS)) {
      const existing = await driver.getRecord(itemKey(item.id));
      if (existing) continue;
      await driver.putRecord(itemKey(item.id), JSON.stringify(item));
      await driver.addToIndex(TRIAGE_QUEUE_INDEX, item.id);
      inserted += 1;
    }
    return inserted;
  }

  /**
   * Applies a bulk mutation to the stored queue. Reads the current collection,
   * lets the pure model decide, persists only what changed, and returns the
   * model's result. Audit writing is the caller's job (`recordTriageAudit`),
   * so a storage failure cannot produce a half-written audit trail.
   */
  async apply(request: BulkTriageRequest): Promise<BulkTriageResult> {
    const items = await this.list(request.orgId);
    const result = applyBulkTriage(items, request);
    if (result.updated.length > 0) await this.save(result.updated);
    return result;
  }
}

export const triageStore = new TriageStore();
