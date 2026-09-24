'use client';

/**
 * Ledger state change diff view for contract runs (#1119).
 *
 * Shows what a run did to ledger state as a before/after comparison: a filter
 * chip per change type, a side-by-side or unified payload view, and an
 * expandable field-level breakdown for each entry.
 *
 * Comparison logic lives in `state-diff-utils` so it can be unit-tested against
 * the same code this component runs. Colours come from the Navy Professional
 * CSS variables, so both themes are covered without a second palette.
 */

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { LedgerChangeType, LedgerStateChange } from '../types';
import {
  STATE_CHANGE_FILTERS,
  compareLedgerValues,
  countFieldChanges,
  countForFilter,
  filterStateChanges,
  formatLedgerValue,
  summarizeStateChanges,
  type StateChangeFilter,
} from './state-diff-utils';
import { EmptyState } from '../../components/EmptyState';

interface ContractStateDiffViewProps {
  changes: LedgerStateChange[];
  /** Renders a skeleton while ledger data is still being fetched. */
  isLoading?: boolean;
  /** Message to surface instead of the diff when loading failed. */
  error?: string | null;
}

type DiffLayout = 'split' | 'unified';

const CHANGE_COLORS: Record<LedgerChangeType, string> = {
  created: '#444444',
  updated: '#111111',
  deleted: '#333333',
};

/** Tinted pill matching the semantic colour of a change type. */
function ChangeBadge({ changeType }: { changeType: LedgerChangeType }) {
  const color = CHANGE_COLORS[changeType];
  return (
    <span
      className="badge text-xs"
      style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
    >
      {changeType.toUpperCase()}
    </span>
  );
}

/** Monospace payload block; falls back to a placeholder when a side is absent. */
function PayloadBlock({ value, absentLabel }: { value?: string; absentLabel: string }) {
  const formatted = formatLedgerValue(value);
  return (
    <pre
      className="code-text m-0 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all"
      style={{
        background: 'var(--bg)',
        border: '1px solid var(--border-color)',
        color: formatted ? 'var(--text-primary)' : 'var(--text-secondary)',
      }}
    >
      {formatted || absentLabel}
    </pre>
  );
}

/** One added / removed / changed field row. */
function FieldRow({ name, color, children }: { name: string; color: string; children: ReactNode }) {
  return (
    <div
      className="code-text rounded px-2 py-1"
      style={{
        background: `color-mix(in srgb, ${color} 8%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      }}
    >
      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
        {name}:
      </span>{' '}
      {children}
    </div>
  );
}

export default function ContractStateDiffView({
  changes,
  isLoading = false,
  error = null,
}: ContractStateDiffViewProps) {
  const [filter, setFilter] = useState<StateChangeFilter>('all');
  const [layout, setLayout] = useState<DiffLayout>('split');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const summary = useMemo(() => summarizeStateChanges(changes), [changes]);
  const visibleChanges = useMemo(() => filterStateChanges(changes, filter), [changes, filter]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-xl border p-4"
        style={{ borderColor: '#333333', background: 'rgba(204, 16, 22, 0.06)' }}
      >
        <p className="text-sm font-semibold" style={{ color: '#333333' }}>
          Could not load ledger state changes
        </p>
        <p className="text-meta mt-1">{error}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3" role="status" aria-live="polite">
        <span className="sr-only">Loading ledger state changes</span>
        <div className="skeleton h-8 w-64" />
        {[0, 1, 2].map((index) => (
          <div key={index} className="skeleton h-28 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (summary.total === 0) {
    return (
      <EmptyState
        type="generic"
        title="No state changes detected"
        description="This run did not commit any contract or ledger state. Runs still in flight report their footprint once they finish."
        compact
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters and layout toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by change type">
          {STATE_CHANGE_FILTERS.map((option) => {
            const isActive = filter === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setFilter(option.id)}
                aria-pressed={isActive}
                className={`chip text-xs ${isActive ? 'chip-active' : ''}`}
              >
                {option.label} ({countForFilter(summary, option.id)})
              </button>
            );
          })}
        </div>

        <div className="flex gap-2" role="group" aria-label="Diff layout">
          {(['split', 'unified'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setLayout(option)}
              aria-pressed={layout === option}
              className={`chip text-xs ${layout === option ? 'chip-active' : ''}`}
            >
              {option === 'split' ? 'Side by side' : 'Unified'}
            </button>
          ))}
        </div>
      </div>

      {visibleChanges.length === 0 ? (
        <EmptyState
          type="generic"
          title="No entries match this filter"
          description={`This run has no ${filter} ledger entries. Choose a different change type above.`}
          compact
        />
      ) : (
        <div className="space-y-3">
          {visibleChanges.map((change) => {
            const isExpanded = expandedIds.has(change.id);
            const diff = compareLedgerValues(change.before, change.after);
            const fieldChanges = countFieldChanges(diff);
            const detailsId = `state-diff-details-${change.id}`;

            return (
              <article
                key={change.id}
                className="rounded-xl border overflow-hidden"
                style={{ borderColor: 'var(--border-color)', background: 'var(--surface)' }}
              >
                <div className="p-4" style={{ background: 'var(--bg)' }}>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <ChangeBadge changeType={change.changeType} />
                    <span className="chip text-xs">{change.entryType}</span>
                    <span className="code-text truncate" style={{ color: 'var(--text-secondary)' }}>
                      {change.id}
                    </span>
                  </div>

                  {diff.parseFailed ? (
                    <p className="text-meta">
                      Payload is not JSON — showing the raw before and after values.
                    </p>
                  ) : fieldChanges > 0 ? (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(change.id)}
                      aria-expanded={isExpanded}
                      aria-controls={detailsId}
                      className="link text-xs"
                    >
                      {isExpanded
                        ? 'Hide field-level changes'
                        : `Show ${fieldChanges} field-level change${fieldChanges === 1 ? '' : 's'}`}
                    </button>
                  ) : (
                    <p className="text-meta">No field-level differences.</p>
                  )}
                </div>

                {/* Before / after payloads */}
                <div
                  className={
                    layout === 'split'
                      ? 'grid grid-cols-1 md:grid-cols-2 gap-3 p-4'
                      : 'flex flex-col gap-3 p-4'
                  }
                >
                  <div>
                    <div className="text-caption uppercase tracking-wide mb-1">Before</div>
                    <PayloadBlock value={change.before} absentLabel="— entry did not exist" />
                  </div>
                  <div>
                    <div className="text-caption uppercase tracking-wide mb-1">After</div>
                    <PayloadBlock value={change.after} absentLabel="— entry was removed" />
                  </div>
                </div>

                {isExpanded && fieldChanges > 0 && (
                  <div
                    id={detailsId}
                    className="p-4 border-t space-y-3"
                    style={{ borderColor: 'var(--border-color)' }}
                  >
                    {Object.keys(diff.added).length > 0 && (
                      <div>
                        <div className="text-caption mb-1" style={{ color: CHANGE_COLORS.created }}>
                          Added fields
                        </div>
                        <div className="space-y-1">
                          {Object.entries(diff.added).map(([key, value]) => (
                            <FieldRow key={key} name={key} color={CHANGE_COLORS.created}>
                              <span style={{ color: CHANGE_COLORS.created }}>
                                {JSON.stringify(value)}
                              </span>
                            </FieldRow>
                          ))}
                        </div>
                      </div>
                    )}

                    {Object.keys(diff.removed).length > 0 && (
                      <div>
                        <div className="text-caption mb-1" style={{ color: CHANGE_COLORS.deleted }}>
                          Removed fields
                        </div>
                        <div className="space-y-1">
                          {Object.entries(diff.removed).map(([key, value]) => (
                            <FieldRow key={key} name={key} color={CHANGE_COLORS.deleted}>
                              <span className="line-through" style={{ color: CHANGE_COLORS.deleted }}>
                                {JSON.stringify(value)}
                              </span>
                            </FieldRow>
                          ))}
                        </div>
                      </div>
                    )}

                    {Object.keys(diff.changed).length > 0 && (
                      <div>
                        <div className="text-caption mb-1" style={{ color: CHANGE_COLORS.updated }}>
                          Changed fields
                        </div>
                        <div className="space-y-1">
                          {Object.entries(diff.changed).map(([key, value]) => (
                            <FieldRow key={key} name={key} color={CHANGE_COLORS.updated}>
                              <span className="line-through" style={{ color: 'var(--text-secondary)' }}>
                                {JSON.stringify(value.before)}
                              </span>
                              {' → '}
                              <span style={{ color: CHANGE_COLORS.updated }}>
                                {JSON.stringify(value.after)}
                              </span>
                            </FieldRow>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
