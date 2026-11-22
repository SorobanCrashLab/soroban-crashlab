import { describe, expect, it } from 'vitest';
import {
  appendReply,
  appendThread,
  applyResolveUndo,
  commitOptimistic,
  countThreads,
  createReply,
  createResolveUndoToken,
  createThread,
  filterThreads,
  isResolved,
  isUndoTokenLive,
  MAX_THREAD_BODY_LENGTH,
  MENTION_ROSTER,
  removeReply,
  removeThread,
  RESOLVE_UNDO_WINDOW_MS,
  resolveThread,
  unresolveThread,
  validateThreadBody,
  type AnnotationThread,
} from './annotation-thread-utils';
import { tokenizeMentions } from './mention-tokenizer';
import {
  ANNOTATION_THREADS_STORAGE_KEY,
  parseThreadStore,
} from './annotation-thread-gateway';

const thread = (id: string, overrides: Partial<AnnotationThread> = {}): AnnotationThread => ({
  id,
  runId: 'run-1',
  root: 'root comment',
  replies: [],
  author: 'analyst',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('thread schema and validation', () => {
  it('creates a thread with an empty reply chain and no resolver', () => {
    const created = createThread({
      id: 't1',
      runId: 'run-9',
      body: '  trailing space  ',
      author: 'analyst',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(created).toEqual({
      id: 't1',
      runId: 'run-9',
      root: 'trailing space',
      replies: [],
      author: 'analyst',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(isResolved(created)).toBe(false);
  });

  it('rejects empty and over-long bodies', () => {
    expect(validateThreadBody('   ')).toEqual({
      valid: false,
      error: 'Comment cannot be empty',
    });
    expect(validateThreadBody('x'.repeat(MAX_THREAD_BODY_LENGTH))).toEqual({ valid: true });
    expect(validateThreadBody('x'.repeat(MAX_THREAD_BODY_LENGTH + 1)).valid).toBe(false);
  });
});

describe('filter tabs and counts', () => {
  const threads = [
    thread('a'),
    thread('b', { resolvedBy: 'maintainer', resolvedAt: '2026-01-02T00:00:00.000Z' }),
    thread('c'),
  ];

  it('counts open, resolved and all', () => {
    expect(countThreads(threads)).toEqual({ open: 2, resolved: 1, all: 3 });
  });

  it('filters by resolved state', () => {
    expect(filterThreads(threads, 'open').map((t) => t.id)).toEqual(['a', 'c']);
    expect(filterThreads(threads, 'resolved').map((t) => t.id)).toEqual(['b']);
    expect(filterThreads(threads, 'all')).toHaveLength(3);
  });
});

describe('resolve attribution', () => {
  it('records who resolved and clears the fields on reopen', () => {
    const resolved = resolveThread([thread('a')], 'a', 'maintainer', '2026-02-01T10:00:00.000Z');
    expect(resolved[0].resolvedBy).toBe('maintainer');
    expect(resolved[0].resolvedAt).toBe('2026-02-01T10:00:00.000Z');

    const reopened = unresolveThread(resolved, 'a');
    expect(isResolved(reopened[0])).toBe(false);
    expect('resolvedBy' in reopened[0]).toBe(false);
    expect('resolvedAt' in reopened[0]).toBe(false);
  });
});

describe('optimistic posting rollback', () => {
  it('keeps the new thread when the gateway accepts the write', () => {
    const previous = [thread('a')];
    const next = appendThread(previous, thread('b'));
    const result = commitOptimistic(previous, next, () => undefined);
    expect(result.ok).toBe(true);
    expect(result.value.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('restores the pre-post list when the gateway throws', () => {
    const previous = [thread('a')];
    const next = appendThread(previous, thread('b'));
    const result = commitOptimistic(previous, next, () => {
      throw new Error('quota exceeded');
    });
    expect(result.ok).toBe(false);
    expect(result.value).toEqual(previous);
    expect(removeThread(next, 'b')).toEqual(previous);
  });

  it('rolls a failed reply back to the thread it came from', () => {
    const base = [thread('a')];
    const reply = createReply({
      id: 'r1',
      body: 'looks like an auth bug',
      author: 'analyst',
      createdAt: '2026-01-03T00:00:00.000Z',
    });
    const optimistic = appendReply(base, 'a', reply);
    expect(optimistic[0].replies).toHaveLength(1);

    const result = commitOptimistic(removeReply(optimistic, 'a', 'r1'), optimistic, () => {
      throw new Error('offline');
    });
    expect(result.ok).toBe(false);
    expect(result.value[0].replies).toEqual([]);
  });
});

describe('resolve-undo race', () => {
  const open = thread('a');
  const resolved = resolveThread([open], 'a', 'maintainer', '2026-02-01T10:00:00.000Z');
  const token = createResolveUndoToken(open, 1_000);

  it('restores the pre-resolve thread inside the 5s window', () => {
    expect(RESOLVE_UNDO_WINDOW_MS).toBe(5000);
    expect(isUndoTokenLive(token, 1_000 + 4_999)).toBe(true);
    const undone = applyResolveUndo(resolved, token, 1_000 + 4_999);
    expect(isResolved(undone[0])).toBe(false);
  });

  it('is a no-op once the window has closed', () => {
    expect(isUndoTokenLive(token, 1_000 + RESOLVE_UNDO_WINDOW_MS)).toBe(false);
    const undone = applyResolveUndo(resolved, token, 1_000 + RESOLVE_UNDO_WINDOW_MS);
    expect(undone).toEqual(resolved);
    expect(isResolved(undone[0])).toBe(true);
  });

  it('is a no-op when the thread is gone', () => {
    expect(applyResolveUndo([], token, 1_000)).toEqual([]);
  });
});

describe('mention tokenizer', () => {
  const tokenize = (text: string) => tokenizeMentions(text, MENTION_ROSTER);

  it('links a roster name and leaves the surrounding text alone', () => {
    expect(tokenize('ping @ana about this')).toEqual([
      { type: 'text', value: 'ping ' },
      { type: 'mention', value: '@ana', handle: 'ana' },
      { type: 'text', value: ' about this' },
    ]);
  });

  it('matches the roster case-insensitively but keeps roster casing on the link', () => {
    expect(tokenize('@ANA')).toEqual([{ type: 'mention', value: '@ANA', handle: 'ana' }]);
  });

  it('renders an unknown handle literally', () => {
    expect(tokenize('@nobody here')).toEqual([{ type: 'text', value: '@nobody here' }]);
  });

  it('treats @@ as an escape so the name is never linked', () => {
    expect(tokenize('@@ana')).toEqual([{ type: 'text', value: '@@ana' }]);
    expect(tokenize('@@')).toEqual([{ type: 'text', value: '@@' }]);
  });

  it('leaves a trailing @ as literal text', () => {
    expect(tokenize('ship it @')).toEqual([{ type: 'text', value: 'ship it @' }]);
    expect(tokenize('@')).toEqual([{ type: 'text', value: '@' }]);
  });

  it('handles unicode handles and non-ascii bodies', () => {
    expect(tokenize('привет @zoë!')).toEqual([
      { type: 'text', value: 'привет ' },
      { type: 'mention', value: '@zoë', handle: 'zoë' },
      { type: 'text', value: '!' },
    ]);
  });

  it('does not break on emoji next to a mention', () => {
    expect(tokenize('🎉@ana')).toEqual([
      { type: 'text', value: '🎉' },
      { type: 'mention', value: '@ana', handle: 'ana' },
    ]);
  });

  it('returns nothing for an empty body', () => {
    expect(tokenize('')).toEqual([]);
  });
});

describe('storage gateway', () => {
  it('pins the versioned storage key', () => {
    expect(ANNOTATION_THREADS_STORAGE_KEY).toBe('crashlab:run-annotation-threads:v1');
  });

  it('reads corrupt or absent storage as no threads', () => {
    expect(parseThreadStore(null)).toEqual({});
    expect(parseThreadStore('not json')).toEqual({});
    expect(parseThreadStore('[1,2,3]')).toEqual({});
  });

  it('round-trips threads keyed by run', () => {
    const store = { 'run-1': [thread('a')] };
    expect(parseThreadStore(JSON.stringify(store))).toEqual(store);
  });
});
