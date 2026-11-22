'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMaintainerMode } from '../../../useMaintainerMode';
import { recordAuditEvent } from '../../../../lib/audit/audit-sink';
import {
  createLocalAnnotationThreadGateway,
  type AnnotationThreadGateway,
} from './annotation-thread-gateway';
import { tokenizeMentions } from './mention-tokenizer';
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
  MAX_THREAD_BODY_LENGTH,
  MENTION_ROSTER,
  removeReply,
  RESOLVE_UNDO_WINDOW_MS,
  resolveThread,
  THREAD_FILTERS,
  unresolveThread,
  validateThreadBody,
  type AnnotationThread,
  type ResolveUndoToken,
  type ThreadFilter,
} from './annotation-thread-utils';

interface RunAnnotationThreadsProps {
  runId: string;
  /** Injectable for tests; defaults to the localStorage-backed gateway. */
  gateway?: AnnotationThreadGateway;
}

const FILTER_LABEL: Record<ThreadFilter, string> = {
  open: 'Open',
  resolved: 'Resolved',
  all: 'All',
};

/**
 * Clock reads live behind a helper so the resolve handlers stay free of direct
 * impure calls in the component body.
 */
function nowMs(): number {
  return Date.now();
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

/** Renders roster mentions as inert links and everything else as plain text. */
function MentionText({ body }: { body: string }) {
  const tokens = useMemo(() => tokenizeMentions(body, MENTION_ROSTER), [body]);
  return (
    <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-700 dark:text-zinc-300">
      {tokens.map((token, index) =>
        token.type === 'mention' ? (
          <span
            key={index}
            role="link"
            aria-disabled="true"
            title={`${token.handle} (mentions do not notify in this release)`}
            className="rounded px-1 font-medium text-indigo-600 dark:text-indigo-400"
          >
            {token.value}
          </span>
        ) : (
          <span key={index}>{token.value}</span>
        ),
      )}
    </p>
  );
}

export default function RunAnnotationThreads({ runId, gateway }: RunAnnotationThreadsProps) {
  const { isMaintainer } = useMaintainerMode();
  const resolvedGateway = useMemo(
    () => gateway ?? createLocalAnnotationThreadGateway(),
    [gateway],
  );
  // Both maintainers and analysts may post; the label is what resolve
  // attribution records on the thread.
  const author = isMaintainer ? 'maintainer' : 'analyst';

  const [threads, setThreads] = useState<AnnotationThread[]>([]);
  const [filter, setFilter] = useState<ThreadFilter>('open');
  const [rootDraft, setRootDraft] = useState('');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [undoToken, setUndoToken] = useState<ResolveUndoToken | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Storage is browser-only, so the first paint matches the server HTML and the
  // threads arrive after mount.
  useEffect(() => {
    queueMicrotask(() => setThreads(resolvedGateway.load(runId)));
  }, [resolvedGateway, runId]);

  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, []);

  /**
   * Applies `next` immediately and persists it. A rejected write restores the
   * list the user saw before the click, so an optimistic post never leaves a
   * comment on screen that no one else will ever see.
   */
  const commit = useCallback(
    (previous: readonly AnnotationThread[], next: AnnotationThread[], failureMessage: string) => {
      setThreads(next);
      const result = commitOptimistic([...previous], next, (value) =>
        resolvedGateway.save(runId, value),
      );
      setThreads(result.value);
      setError(result.ok ? null : failureMessage);
      return result.ok;
    },
    [resolvedGateway, runId],
  );

  const handlePostThread = () => {
    const validation = validateThreadBody(rootDraft);
    if (!validation.valid) {
      setError(validation.error ?? 'Comment cannot be empty');
      return;
    }
    const thread = createThread({
      id: newId('thread'),
      runId,
      body: rootDraft,
      author,
      createdAt: new Date().toISOString(),
    });
    const previous = threads;
    if (commit(previous, appendThread(previous, thread), 'Could not save the comment — it was rolled back.')) {
      setRootDraft('');
    }
  };

  const handlePostReply = (threadId: string) => {
    const draft = replyDrafts[threadId] ?? '';
    const validation = validateThreadBody(draft);
    if (!validation.valid) {
      setError(validation.error ?? 'Reply cannot be empty');
      return;
    }
    const reply = createReply({
      id: newId('reply'),
      body: draft,
      author,
      createdAt: new Date().toISOString(),
    });
    const optimistic = appendReply(threads, threadId, reply);
    setThreads(optimistic);
    const result = commitOptimistic(
      removeReply(optimistic, threadId, reply.id),
      optimistic,
      (value) => resolvedGateway.save(runId, value),
    );
    setThreads(result.value);
    setError(result.ok ? null : 'Could not save the reply — it was rolled back.');
    if (result.ok) {
      setReplyDrafts((drafts) => ({ ...drafts, [threadId]: '' }));
    }
  };

  const handleResolve = (thread: AnnotationThread) => {
    const previous = threads;
    const next = resolveThread(previous, thread.id, author, new Date().toISOString());
    if (!commit(previous, next, 'Could not resolve the thread — it was rolled back.')) return;

    recordAuditEvent({ action: 'thread.resolve', target: `${runId}/${thread.id}`, metadata: { author } });

    const token = createResolveUndoToken(thread, nowMs());
    setUndoToken(token);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndoToken(null), RESOLVE_UNDO_WINDOW_MS);
  };

  const handleUnresolve = (thread: AnnotationThread) => {
    const previous = threads;
    commit(previous, unresolveThread(previous, thread.id), 'Could not reopen the thread — it was rolled back.');
  };

  const handleUndo = () => {
    if (!undoToken) return;
    // `applyResolveUndo` is a no-op once the window has closed, so a click that
    // races the dismiss timer cannot un-resolve a thread after the fact.
    const previous = threads;
    const next = applyResolveUndo(previous, undoToken, nowMs());
    setUndoToken(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    commit(previous, next, 'Could not undo — the thread stays resolved.');
  };

  const counts = countThreads(threads);
  const visible = filterThreads(threads, filter);

  return (
    <section
      aria-labelledby="run-annotation-threads-heading"
      className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2 id="run-annotation-threads-heading" className="text-xl font-bold">
        Discussion
      </h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Thread findings on this run. Mention a teammate with @name — mentions render as links but
        do not notify in this release.
      </p>

      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Filter threads">
        {THREAD_FILTERS.map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={filter === option}
            onClick={() => setFilter(option)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              filter === option
                ? 'bg-indigo-600 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
            }`}
          >
            {FILTER_LABEL[option]} ({counts[option]})
          </button>
        ))}
      </div>

      <div className="mt-4">
        <label htmlFor="thread-composer" className="sr-only">
          Start a thread
        </label>
        <textarea
          id="thread-composer"
          value={rootDraft}
          onChange={(event) => setRootDraft(event.target.value)}
          rows={3}
          maxLength={MAX_THREAD_BODY_LENGTH}
          placeholder="Start a thread — what did you find?"
          className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {MAX_THREAD_BODY_LENGTH - rootDraft.length} characters left
          </span>
          <button
            type="button"
            onClick={handlePostThread}
            disabled={rootDraft.trim().length === 0}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Post thread
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <ul className="mt-6 space-y-4">
        {visible.length === 0 && (
          <li className="text-sm text-zinc-500 dark:text-zinc-400">No {filter === 'all' ? '' : filter} threads yet.</li>
        )}
        {visible.map((thread) => (
          <li key={thread.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {thread.author}
                </p>
                <MentionText body={thread.root} />
              </div>
              <button
                type="button"
                onClick={() => (isResolved(thread) ? handleUnresolve(thread) : handleResolve(thread))}
                className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                {isResolved(thread) ? 'Reopen' : 'Resolve'}
              </button>
            </div>

            {isResolved(thread) && (
              <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                Resolved by {thread.resolvedBy}
              </p>
            )}

            {thread.replies.length > 0 && (
              <ul className="mt-3 space-y-3 border-l-2 border-zinc-200 pl-4 dark:border-zinc-800">
                {thread.replies.map((reply) => (
                  <li key={reply.id}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      {reply.author}
                    </p>
                    <MentionText body={reply.body} />
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex gap-2">
              <label htmlFor={`reply-${thread.id}`} className="sr-only">
                Reply to thread
              </label>
              <input
                id={`reply-${thread.id}`}
                value={replyDrafts[thread.id] ?? ''}
                onChange={(event) =>
                  setReplyDrafts((drafts) => ({ ...drafts, [thread.id]: event.target.value }))
                }
                maxLength={MAX_THREAD_BODY_LENGTH}
                placeholder="Reply…"
                className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
              <button
                type="button"
                onClick={() => handlePostReply(thread.id)}
                disabled={(replyDrafts[thread.id] ?? '').trim().length === 0}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Reply
              </button>
            </div>
          </li>
        ))}
      </ul>

      {undoToken && (
        <div
          role="status"
          className="mt-4 flex items-center justify-between rounded-xl bg-zinc-900 px-4 py-3 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          <span>Thread resolved.</span>
          <button type="button" onClick={handleUndo} className="font-semibold underline">
            Undo
          </button>
        </div>
      )}

      <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-500">
        Roster: {MENTION_ROSTER.join(', ')}
      </p>
    </section>
  );
}
