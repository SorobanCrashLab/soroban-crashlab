import { childEntries, preview } from './decode';
import type { Change, XdrNode } from './types';
export function structuralDiff(
  left: XdrNode,
  right: XdrNode,
  limit = 2000,
): { changes: Change[]; truncated: boolean } {
  const changes: Change[] = [];
  let truncated = false;
  const add = (change: Change) => {
    if (changes.length < limit) changes.push(change);
    else truncated = true;
  };
  function visit(a: XdrNode | undefined, b: XdrNode | undefined, path: string) {
    if (truncated) return;
    if (!a) {
      add({ path, kind: 'added', after: preview(b!) });
      return;
    }
    if (!b) {
      add({ path, kind: 'removed', before: preview(a) });
      return;
    }
    if (a.kind !== b.kind) {
      add({ path, kind: 'changed', before: preview(a), after: preview(b) });
      return;
    }
    const aChildren = childEntries(a);
    const bChildren = childEntries(b);
    if (!aChildren.length && !bChildren.length) {
      if (JSON.stringify(a) !== JSON.stringify(b))
        add({ path, kind: 'changed', before: preview(a), after: preview(b) });
      return;
    }
    if (a.kind === 'union' && b.kind === 'union' && a.switch !== b.switch)
      add({ path, kind: 'changed', before: String(a.switch), after: String(b.switch) });
    const aMap = new Map(aChildren);
    const bMap = new Map(bChildren);
    // SDK field order, followed by right-only fields; never locale dependent.
    for (const key of new Set([...aMap.keys(), ...bMap.keys()]))
      visit(aMap.get(key), bMap.get(key), `${path}/${key}`);
  }
  visit(left, right, '');
  return { changes, truncated };
}
export function rawDiff(
  a: Uint8Array,
  b: Uint8Array,
): { differentBytes: number; firstOffset: number | null; leftBytes: number; rightBytes: number } {
  let differentBytes = 0;
  let firstOffset: number | null = null;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    if (a[i] !== b[i]) {
      differentBytes++;
      firstOffset ??= i;
    }
  return { differentBytes, firstOffset, leftBytes: a.length, rightBytes: b.length };
}
