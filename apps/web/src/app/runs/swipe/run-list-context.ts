'use client';

import { safeStorageGet, safeStorageRemove, safeStorageSet } from '@/lib/local-storage';

const CONTEXT_KEY = 'crashlab-run-list-context';
const CONTEXT_MAX_AGE_MS = 5 * 60 * 1000;

export interface RunListContext {
  ids: string[];
  filters: Record<string, string>;
  sort: { key: string; direction: string };
  capturedAt: number;
}

export function captureRunListContext(ids: string[], filters: Record<string, string> = {}, sort: { key: string; direction: string } = { key: 'queuedAt', direction: 'desc' }): void {
  const ctx: RunListContext = { ids, filters, sort, capturedAt: Date.now() };
  safeStorageSet('sessionStorage', CONTEXT_KEY, JSON.stringify(ctx));
}

export function readRunListContext(): RunListContext | null {
  const raw = safeStorageGet('sessionStorage', CONTEXT_KEY);
  if (!raw) return null;
  try {
    const ctx: RunListContext = JSON.parse(raw);
    if (Date.now() - ctx.capturedAt > CONTEXT_MAX_AGE_MS) {
      safeStorageRemove('sessionStorage', CONTEXT_KEY);
      return null;
    }
    return ctx;
  } catch {
    return null;
  }
}

export function resolveNeighbors(
  currentId: string,
  ctx: RunListContext | null,
): { prev: string | null; next: string | null } {
  if (!ctx || !ctx.ids.includes(currentId)) {
    return { prev: null, next: null };
  }
  const idx = ctx.ids.indexOf(currentId);
  return {
    prev: idx > 0 ? ctx.ids[idx - 1] : null,
    next: idx < ctx.ids.length - 1 ? ctx.ids[idx + 1] : null,
  };
}

export function clearRunListContext(): void {
  safeStorageRemove('sessionStorage', CONTEXT_KEY);
}
