/**
 * Pure data layer for run annotation threads (#1429).
 *
 * Single-shot annotations (`run-annotations-utils.ts`) cannot carry a
 * discussion, so forensics threads live here instead: a root comment, a reply
 * chain, and a thread-level resolved flag that records who resolved it.
 * Everything in this module is side-effect free so the reply/resolve/undo
 * behaviour is unit-testable without rendering the page.
 */

export const MAX_THREAD_BODY_LENGTH = 500;

/** How long the "Resolved — Undo" snackbar stays actionable. */
export const RESOLVE_UNDO_WINDOW_MS = 5000;

export type ThreadFilter = 'open' | 'resolved' | 'all';

export const THREAD_FILTERS: readonly ThreadFilter[] = ['open', 'resolved', 'all'];

export interface AnnotationReply {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface AnnotationThread {
  id: string;
  runId: string;
  /** Body of the comment that opened the thread. */
  root: string;
  replies: AnnotationReply[];
  author: string;
  createdAt: string;
  resolvedBy?: string;
  resolvedAt?: string;
}

export interface ThreadCounts {
  open: number;
  resolved: number;
  all: number;
}

/**
 * Names that render as mention links. The roster is the maintainer-mode user
 * list: mentions are a rendering affordance in v1, so an unknown `@handle`
 * stays literal text rather than becoming a dead link. Notifications are
 * deliberately out of scope — see the handoff note in the PR body.
 */
export const MENTION_ROSTER: readonly string[] = [
  'ana',
  'dmitri',
  'kwame',
  'maintainers',
  'priya',
  'zoë',
];

export function validateThreadBody(text: string): { valid: boolean; error?: string } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { valid: false, error: 'Comment cannot be empty' };
  }
  if (trimmed.length > MAX_THREAD_BODY_LENGTH) {
    return {
      valid: false,
      error: `Comment exceeds ${MAX_THREAD_BODY_LENGTH} character limit`,
    };
  }
  return { valid: true };
}

export function createThread(input: {
  id: string;
  runId: string;
  body: string;
  author: string;
  createdAt: string;
}): AnnotationThread {
  return {
    id: input.id,
    runId: input.runId,
    root: input.body.trim(),
    replies: [],
    author: input.author,
    createdAt: input.createdAt,
  };
}

export function createReply(input: {
  id: string;
  body: string;
  author: string;
  createdAt: string;
}): AnnotationReply {
  return {
    id: input.id,
    author: input.author,
    body: input.body.trim(),
    createdAt: input.createdAt,
  };
}

export function isResolved(thread: AnnotationThread): boolean {
  return thread.resolvedAt !== undefined;
}

export function appendThread(
  threads: readonly AnnotationThread[],
  thread: AnnotationThread,
): AnnotationThread[] {
  return [...threads, thread];
}

/** Drop a thread by id — the rollback half of an optimistic post. */
export function removeThread(
  threads: readonly AnnotationThread[],
  threadId: string,
): AnnotationThread[] {
  return threads.filter((thread) => thread.id !== threadId);
}

export function appendReply(
  threads: readonly AnnotationThread[],
  threadId: string,
  reply: AnnotationReply,
): AnnotationThread[] {
  return threads.map((thread) =>
    thread.id === threadId ? { ...thread, replies: [...thread.replies, reply] } : thread,
  );
}

/** Drop a reply by id — the rollback half of an optimistic reply. */
export function removeReply(
  threads: readonly AnnotationThread[],
  threadId: string,
  replyId: string,
): AnnotationThread[] {
  return threads.map((thread) =>
    thread.id === threadId
      ? { ...thread, replies: thread.replies.filter((reply) => reply.id !== replyId) }
      : thread,
  );
}

export function resolveThread(
  threads: readonly AnnotationThread[],
  threadId: string,
  resolvedBy: string,
  resolvedAt: string,
): AnnotationThread[] {
  return threads.map((thread) =>
    thread.id === threadId ? { ...thread, resolvedBy, resolvedAt } : thread,
  );
}

export function unresolveThread(
  threads: readonly AnnotationThread[],
  threadId: string,
): AnnotationThread[] {
  return threads.map((thread) => {
    if (thread.id !== threadId) return thread;
    const { resolvedBy: _resolvedBy, resolvedAt: _resolvedAt, ...rest } = thread;
    return rest;
  });
}

export function filterThreads(
  threads: readonly AnnotationThread[],
  filter: ThreadFilter,
): AnnotationThread[] {
  if (filter === 'all') return [...threads];
  const wantResolved = filter === 'resolved';
  return threads.filter((thread) => isResolved(thread) === wantResolved);
}

export function countThreads(threads: readonly AnnotationThread[]): ThreadCounts {
  const resolved = threads.filter(isResolved).length;
  return { open: threads.length - resolved, resolved, all: threads.length };
}

// ── Resolve / undo ───────────────────────────────────────────────────────────
//
// Resolving is low-stakes, so it applies immediately and offers an undo
// snackbar instead of blocking on a confirm dialog. The token below captures
// the pre-resolve thread and the moment the window closes, so an undo click
// that races the snackbar's own expiry is decided by data rather than by which
// timer happened to fire first.

export interface ResolveUndoToken {
  threadId: string;
  /** The thread exactly as it was before resolving. */
  previous: AnnotationThread;
  expiresAt: number;
}

export function createResolveUndoToken(
  thread: AnnotationThread,
  now: number,
  windowMs: number = RESOLVE_UNDO_WINDOW_MS,
): ResolveUndoToken {
  return { threadId: thread.id, previous: thread, expiresAt: now + windowMs };
}

export function isUndoTokenLive(token: ResolveUndoToken, now: number): boolean {
  return now < token.expiresAt;
}

/**
 * Restore the pre-resolve thread. Returns the list untouched when the window
 * has closed or the thread has since disappeared, so a late undo is a no-op
 * rather than resurrecting stale state.
 */
export function applyResolveUndo(
  threads: readonly AnnotationThread[],
  token: ResolveUndoToken,
  now: number,
): AnnotationThread[] {
  if (!isUndoTokenLive(token, now)) return [...threads];
  if (!threads.some((thread) => thread.id === token.threadId)) return [...threads];
  return threads.map((thread) => (thread.id === token.threadId ? token.previous : thread));
}

// ── Optimistic posting ───────────────────────────────────────────────────────

export interface OptimisticCommit<T> {
  ok: boolean;
  /** `next` when the write succeeded, otherwise `previous` restored verbatim. */
  value: T;
}

/**
 * Show `next` now, keep it only if `persist` accepts it. A throwing gateway
 * hands back `previous` unchanged, which is what keeps a failed post from
 * leaving a comment on screen that was never stored.
 */
export function commitOptimistic<T>(
  previous: T,
  next: T,
  persist: (value: T) => void,
): OptimisticCommit<T> {
  try {
    persist(next);
    return { ok: true, value: next };
  } catch {
    return { ok: false, value: previous };
  }
}
