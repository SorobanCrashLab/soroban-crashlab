'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { applyBulkTriage, type BulkTriageFailure } from '@/lib/triage/bulk';
import { TRIAGE_SHORTCUTS, mapTriageKey, moveSelection } from '@/lib/triage/keyboard';
import {
  TRIAGE_STATUSES,
  TRIAGE_STATUS_LABELS,
  type TriageItemState,
  type TriageStatus,
} from '@/lib/triage/types';

export interface TriageQueueClientProps {
  initialItems: TriageItemState[];
  orgId: string;
  /** Resolved server-side; the API refuses an unaudited mutation. */
  actor: string;
}

type Mutation = { status?: TriageStatus; assignee?: string | null; priority?: TriageItemState['priority'] };

const STATUS_KEYS: Record<TriageStatus, string> = {
  new: '1',
  triaged: '2',
  'in-progress': '3',
  resolved: '4',
};

const STATUS_TONE: Record<TriageStatus, string> = {
  new: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  triaged: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  'in-progress': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  resolved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
};

const PRIORITY_TONE: Record<TriageItemState['priority'], string> = {
  p0: 'text-rose-600 dark:text-rose-400',
  p1: 'text-orange-600 dark:text-orange-400',
  p2: 'text-slate-600 dark:text-slate-400',
  p3: 'text-slate-400 dark:text-slate-500',
};

interface BulkResponseBody {
  data?: { failed?: BulkTriageFailure[]; progress?: { percentComplete: number } };
  error?: string;
}

export default function TriageQueueClient({ initialItems, orgId, actor }: TriageQueueClientProps) {
  const router = useRouter();
  const [items, setItems] = useState<TriageItemState[]>(initialItems);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState(initialItems.length > 0 ? 0 : -1);
  const [assigneeDraft, setAssigneeDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failures, setFailures] = useState<BulkTriageFailure[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const assigneeRef = useRef<HTMLInputElement>(null);

  const members = useMemo(
    () => [...new Set(items.map((item) => item.assignee).filter((value): value is string => Boolean(value)))].sort(),
    [items],
  );

  const counts = useMemo(() => {
    const base: Record<TriageStatus, number> = { new: 0, triaged: 0, 'in-progress': 0, resolved: 0 };
    for (const item of items) base[item.status] += 1;
    return base;
  }, [items]);

  const mutate = useCallback(
    async (mutation: Mutation, ids: string[]) => {
      if (ids.length === 0 || pending) return;
      const previous = items;
      const optimistic = applyBulkTriage(items, { ids, actor, ...mutation });

      setItems(optimistic.items);
      setFailures(optimistic.failed);
      setError(null);
      setPending(true);

      try {
        const response = await fetch('/api/triage/queue', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ids, actor, orgId, ...mutation }),
        });
        const body = (await response.json()) as BulkResponseBody;
        if (!response.ok) throw new Error(body.error ?? `The bulk action failed (${response.status}).`);

        // Trust the server's per-item outcome, not the optimistic guess.
        if (body.data?.failed) setFailures(body.data.failed);
        if (body.data?.progress) setProgress(body.data.progress.percentComplete);
        setSelected(new Set());
      } catch (caught) {
        // Revert the whole optimistic patch; the failed rows are still visible.
        setItems(previous);
        setError(caught instanceof Error ? caught.message : 'The bulk action failed.');
      } finally {
        setPending(false);
      }
    },
    [actor, items, orgId, pending],
  );

  const targetIds = useCallback((): string[] => {
    if (selected.size > 0) return [...selected];
    const focused = items[focusedIndex];
    return focused ? [focused.id] : [];
  }, [focusedIndex, items, selected]);

  const toggleSelected = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const action = mapTriageKey({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        target: (event.target as HTMLElement | null) ?? null,
      });
      if (!action) return;
      event.preventDefault();

      switch (action.type) {
        case 'move':
          setFocusedIndex((current) => moveSelection(current, action.delta, items.length));
          break;
        case 'first':
          setFocusedIndex(items.length > 0 ? 0 : -1);
          break;
        case 'last':
          setFocusedIndex(items.length - 1);
          break;
        case 'open': {
          const focused = items[focusedIndex];
          const runId = focused?.runId ?? focused?.id.replace(/^triage:/, '');
          if (runId) router.push(`/runs/${encodeURIComponent(runId)}`);
          break;
        }
        case 'toggle-select': {
          const focused = items[focusedIndex];
          if (focused) toggleSelected(focused.id);
          break;
        }
        case 'select-all':
          setSelected(new Set(items.map((item) => item.id)));
          break;
        case 'clear-selection':
          setSelected(new Set());
          break;
        case 'set-status':
          void mutate({ status: action.status }, targetIds());
          break;
        case 'focus-assignee':
          assigneeRef.current?.focus();
          break;
        case 'show-help':
          setHelpOpen((open) => !open);
          break;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusedIndex, items, mutate, router, targetIds, toggleSelected]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Queue summary">
        {TRIAGE_STATUSES.map((value) => (
          <span
            key={value}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_TONE[value]}`}
          >
            {TRIAGE_STATUS_LABELS[value]} <span className="tabular-nums">{counts[value]}</span>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setHelpOpen((open) => !open)}
          aria-expanded={helpOpen}
          className="ml-auto rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1 text-xs font-semibold text-gray-700 dark:text-gray-300"
        >
          Keyboard shortcuts (?)
        </button>
      </div>

      {helpOpen && (
        <dl className="grid gap-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-4 text-xs sm:grid-cols-2">
          {TRIAGE_SHORTCUTS.map((shortcut) => (
            <div key={shortcut.keys} className="flex items-baseline gap-2">
              <dt className="font-mono font-semibold text-gray-900 dark:text-gray-100">{shortcut.keys}</dt>
              <dd className="text-gray-600 dark:text-gray-400">{shortcut.description}</dd>
            </div>
          ))}
        </dl>
      )}

      <section
        aria-label="Bulk actions"
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4"
      >
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
          {selected.size > 0 ? `${selected.size} selected` : 'No selection — actions apply to the focused row'}
        </p>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Set status">
          {TRIAGE_STATUSES.map((value) => (
            <button
              key={value}
              type="button"
              disabled={pending}
              onClick={() => void mutate({ status: value }, targetIds())}
              className="rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
            >
              <span className="mr-1 font-mono text-gray-500 dark:text-gray-400">{STATUS_KEYS[value]}</span>
              {TRIAGE_STATUS_LABELS[value]}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
            Assignee
            <input
              ref={assigneeRef}
              value={assigneeDraft}
              onChange={(event) => setAssigneeDraft(event.target.value)}
              list="triage-members"
              placeholder="github login"
              className="w-40 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs text-gray-900 dark:text-gray-100"
            />
            <datalist id="triage-members">
              {members.map((member) => (
                <option key={member} value={member} />
              ))}
            </datalist>
          </label>
          <button
            type="button"
            disabled={pending || assigneeDraft.trim().length === 0}
            onClick={() => {
              void mutate({ assignee: assigneeDraft.trim() }, targetIds());
              setAssigneeDraft('');
            }}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Assign
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void mutate({ assignee: null }, targetIds())}
            className="rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            Unassign
          </button>
        </div>
      </section>

      <div aria-live="polite" className="min-h-[1.25rem] text-xs">
        {pending && <span className="text-gray-500 dark:text-gray-400">Applying…</span>}
        {!pending && progress !== null && (
          <span className="text-emerald-600 dark:text-emerald-400">Last batch {progress}% complete.</span>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      {failures.length > 0 && (
        <div role="status" className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          <p className="font-semibold">{failures.length} row(s) were not applied:</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {failures.slice(0, 8).map((failure) => (
              <li key={`${failure.id}:${failure.code}`}>
                <span className="font-mono">{failure.id}</span> — {failure.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul
        role="listbox"
        aria-label="Triage queue"
        aria-multiselectable="true"
        aria-activedescendant={focusedIndex >= 0 ? `triage-row-${focusedIndex}` : undefined}
        className="divide-y divide-gray-100 dark:divide-gray-800 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"
      >
        {items.map((item, index) => {
          const isSelected = selected.has(item.id);
          const isFocused = index === focusedIndex;
          return (
            <li
              key={item.id}
              id={`triage-row-${index}`}
              role="option"
              aria-selected={isSelected}
              onClick={() => setFocusedIndex(index)}
              className={`flex flex-wrap items-center gap-3 px-4 py-3 ${
                isFocused ? 'bg-indigo-50/70 dark:bg-indigo-950/20' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleSelected(item.id)}
                aria-label={`Select ${item.signature}`}
                className="h-4 w-4 rounded border-gray-300 dark:border-gray-700"
              />
              <span className={`w-8 text-xs font-bold ${PRIORITY_TONE[item.priority]}`}>
                {item.priority.toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs text-gray-900 dark:text-gray-100" title={item.signature}>
                  {item.signature}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {item.failureClass} · {item.occurrences} seed{item.occurrences === 1 ? '' : 's'}
                  {item.assignee ? ` · assigned to ${item.assignee}` : ' · unassigned'}
                </p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[item.status]}`}>
                {TRIAGE_STATUS_LABELS[item.status]}
              </span>
              <Link
                href={`/runs/${encodeURIComponent(item.runId ?? item.id.replace(/^triage:/, ''))}`}
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 underline"
              >
                open run
              </Link>
            </li>
          );
        })}
      </ul>

      {items.length === 0 && (
        <p className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
          The queue is empty. Runs with a recorded crash signature appear here automatically.
        </p>
      )}
    </div>
  );
}
