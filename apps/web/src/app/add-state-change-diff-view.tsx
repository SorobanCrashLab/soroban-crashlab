'use client';

import { useState, useMemo } from 'react';
import { LedgerStateChange } from './types';

interface StateChangeDiffViewProps {
  changes: LedgerStateChange[];
  title?: string;
  isLoading?: boolean;
  error?: string | null;
}

type ChangeFilter = 'all' | 'created' | 'updated' | 'deleted';

export default function StateChangeDiffView({
  changes,
  title = 'Ledger State Changes',
  isLoading = false,
  error = null,
}: StateChangeDiffViewProps) {
  const [selectedFilter, setSelectedFilter] = useState<ChangeFilter>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const filteredChanges = useMemo(() => {
    if (selectedFilter === 'all') return changes;
    return changes.filter(c => c.changeType === selectedFilter);
  }, [changes, selectedFilter]);

  const changeStats = useMemo(() => {
    return {
      total: changes.length,
      created: changes.filter(c => c.changeType === 'created').length,
      updated: changes.filter(c => c.changeType === 'updated').length,
      deleted: changes.filter(c => c.changeType === 'deleted').length,
    };
  }, [changes]);

  const toggleExpanded = (id: string) => {
    const newSet = new Set(expandedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedIds(newSet);
  };

  const getChangeColor = (changeType: string) => {
    switch (changeType) {
      case 'created':
        return 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30';
      case 'updated':
        return 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30';
      case 'deleted':
        return 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30';
      default:
        return 'border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/30';
    }
  };

  const getChangeIcon = (changeType: string) => {
    switch (changeType) {
      case 'created':
        return '✨';
      case 'updated':
        return '📝';
      case 'deleted':
        return '🗑️';
      default:
        return '📋';
    }
  };

  const getChangeLabel = (changeType: string) => {
    switch (changeType) {
      case 'created':
        return 'Created';
      case 'updated':
        return 'Updated';
      case 'deleted':
        return 'Deleted';
      default:
        return 'Changed';
    }
  };

  const getValueDisplay = (value?: string) => {
    if (!value) return <span className="text-zinc-400 italic">empty</span>;
    try {
      const parsed = JSON.parse(value);
      return (
        <pre className="text-xs bg-zinc-100 dark:bg-zinc-900 p-2 rounded overflow-auto max-h-48">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      );
    } catch {
      return <code className="text-xs bg-zinc-100 dark:bg-zinc-900 p-1 rounded">{value}</code>;
    }
  };

  if (error) {
    return (
      <section className="border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 rounded-xl p-6 shadow-sm w-full">
        <div className="flex items-start gap-3">
          <div className="text-xl">⚠️</div>
          <div>
            <h2 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-1">
              {title}
            </h2>
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        </div>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 rounded-xl p-6 shadow-sm w-full">
        <h2 className="text-lg font-semibold mb-4">{title}</h2>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 rounded-xl p-6 shadow-sm w-full">
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-1">{title}</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {filteredChanges.length} change{filteredChanges.length !== 1 ? 's' : ''} to ledger state
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          onClick={() => setSelectedFilter('all')}
          className={`p-3 rounded-lg border cursor-pointer transition-all ${
            selectedFilter === 'all'
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
              : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
          }`}
        >
          <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase">All</p>
          <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            {changeStats.total}
          </p>
        </div>

        <div
          onClick={() => setSelectedFilter('created')}
          className={`p-3 rounded-lg border cursor-pointer transition-all ${
            selectedFilter === 'created'
              ? 'border-green-500 bg-green-50 dark:bg-green-950/30'
              : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
          }`}
        >
          <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase">Created</p>
          <p className="text-lg font-bold text-green-600 dark:text-green-400">
            {changeStats.created}
          </p>
        </div>

        <div
          onClick={() => setSelectedFilter('updated')}
          className={`p-3 rounded-lg border cursor-pointer transition-all ${
            selectedFilter === 'updated'
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
              : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
          }`}
        >
          <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase">Updated</p>
          <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
            {changeStats.updated}
          </p>
        </div>

        <div
          onClick={() => setSelectedFilter('deleted')}
          className={`p-3 rounded-lg border cursor-pointer transition-all ${
            selectedFilter === 'deleted'
              ? 'border-red-500 bg-red-50 dark:bg-red-950/30'
              : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
          }`}
        >
          <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase">Deleted</p>
          <p className="text-lg font-bold text-red-600 dark:text-red-400">
            {changeStats.deleted}
          </p>
        </div>
      </div>

      {filteredChanges.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-zinc-500 dark:text-zinc-400">No state changes found</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {filteredChanges.map((change) => (
            <div
              key={change.id}
              className={`border rounded-lg p-4 transition-all ${getChangeColor(change.changeType)}`}
            >
              <button
                onClick={() => toggleExpanded(change.id)}
                className="w-full text-left flex items-start justify-between hover:opacity-75 transition-opacity"
                aria-label={`Toggle details for ${change.id}`}
                aria-expanded={expandedIds.has(change.id)}
              >
                <div className="flex items-start gap-3 flex-1">
                  <span className="text-xl mt-1">{getChangeIcon(change.changeType)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-block px-2 py-1 bg-white dark:bg-zinc-900 rounded text-xs font-semibold">
                        {getChangeLabel(change.changeType)}
                      </span>
                      <code className="text-xs font-mono text-zinc-700 dark:text-zinc-300 truncate">
                        {change.id}
                      </code>
                    </div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      Type: {change.entryType}
                    </p>
                  </div>
                </div>
                <span className="ml-2 text-zinc-500 text-xl">
                  {expandedIds.has(change.id) ? '▼' : '▶'}
                </span>
              </button>

              {expandedIds.has(change.id) && (
                <div className="mt-4 pt-4 border-t border-current border-opacity-20 space-y-3">
                  {change.changeType === 'updated' && (
                    <>
                      <div>
                        <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                          Before
                        </p>
                        {getValueDisplay(change.before)}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                          After
                        </p>
                        {getValueDisplay(change.after)}
                      </div>
                    </>
                  )}

                  {change.changeType === 'created' && (
                    <div>
                      <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                        Value
                      </p>
                      {getValueDisplay(change.after)}
                    </div>
                  )}

                  {change.changeType === 'deleted' && (
                    <div>
                      <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                        Previous Value
                      </p>
                      {getValueDisplay(change.before)}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
