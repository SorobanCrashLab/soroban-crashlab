'use client';

/**
 * ShortcutCheatSheet — accessible, searchable keyboard shortcut reference modal
 * and command palette hint view grouped by context surface (`global_shell`,
 * `run_workspace`, `diff`, `trace`, `logs`, `tables`, `canvas`), displaying
 * non-keyboard UI alternatives and audit-safety indicators (#2315).
 */

import React, { useMemo, useState } from 'react';
import {
  formatShortcutForPlatform,
  type EffectiveShortcutBinding,
  type ShortcutSurface,
} from './shortcutRegistry';

const SURFACE_LABELS: Record<ShortcutSurface, string> = {
  global_shell: 'Global Navigation & Command Shell',
  run_workspace: 'Run Detail & Replay Workspace',
  diff: 'State & Trace Diff Viewer',
  trace: 'Call Sequence & Trace Inspector',
  logs: 'Live Log Viewer Console',
  tables: 'Data Grids & Triage Tables',
  canvas: 'Investigation Whiteboard & Graph Canvas',
};

export interface ShortcutCheatSheetProps {
  bindings: readonly EffectiveShortcutBinding[];
  isOpen: boolean;
  onClose: () => void;
  onTriggerCommand?: (commandId: string) => void;
}

export function ShortcutCheatSheet({
  bindings,
  isOpen,
  onClose,
  onTriggerCommand,
}: ShortcutCheatSheetProps) {
  const [query, setQuery] = useState('');
  const [surfaceFilter, setSurfaceFilter] = useState<ShortcutSurface | 'all'>('all');
  const [platformFormat, setPlatformFormat] = useState<'standard' | 'mac'>('standard');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bindings.filter((b) => {
      if (surfaceFilter !== 'all' && b.surface !== surfaceFilter) return false;
      if (
        q &&
        !b.title.toLowerCase().includes(q) &&
        !b.description.toLowerCase().includes(q) &&
        !b.effectiveBinding.toLowerCase().includes(q) &&
        !b.id.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [bindings, query, surfaceFilter]);

  const groupedBySurface = useMemo(() => {
    const groups = new Map<ShortcutSurface, EffectiveShortcutBinding[]>();
    for (const item of filtered) {
      const list = groups.get(item.surface) ?? [];
      list.push(item);
      groups.set(item.surface, list);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcut-cheatsheet-title"
      className="rounded-2xl border border-[var(--border-color)] bg-[var(--surface)] p-5 shadow-xl space-y-5"
      data-testid="shortcut-cheatsheet-dialog"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] pb-4">
        <div>
          <h2 id="shortcut-cheatsheet-title" className="heading-section">
            Keyboard Shortcuts &amp; Contextual Command Reference
          </h2>
          <p className="text-xs text-meta mt-0.5">
            Every keyboard shortcut includes an explicit non-keyboard UI alternative and respects reduced-motion preferences.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setPlatformFormat((p) => (p === 'standard' ? 'mac' : 'standard'))
            }
            className="btn-outline text-xs px-3 py-1"
          >
            Notation: {platformFormat === 'standard' ? 'Ctrl/Alt (Standard)' : '⌘/⌥ (macOS)'}
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close keyboard shortcuts cheat sheet"
            className="btn-outline text-xs px-3 py-1"
          >
            Close (Esc)
          </button>
        </div>
      </div>

      {/* Search & Surface Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <label className="flex-1 text-xs">
          <span className="sr-only">Filter shortcuts and commands</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by command name, key chord, or surface..."
            className="form-input w-full"
          />
        </label>

        <label className="text-xs">
          <span className="sr-only">Filter by surface</span>
          <select
            value={surfaceFilter}
            onChange={(e) =>
              setSurfaceFilter(e.target.value as ShortcutSurface | 'all')
            }
            className="form-input w-full sm:w-56"
          >
            <option value="all">All surfaces ({bindings.length})</option>
            {(Object.keys(SURFACE_LABELS) as ShortcutSurface[]).map((surf) => (
              <option key={surf} value={surf}>
                {SURFACE_LABELS[surf]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Grouped Shortcut Tables */}
      {groupedBySurface.length === 0 ? (
        <p className="text-xs text-meta py-6 text-center">
          No shortcuts or commands match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <div className="space-y-5">
          {groupedBySurface.map(([surface, items]) => (
            <section
              key={surface}
              aria-labelledby={`cheatsheet-surf-${surface}`}
              className="space-y-2"
            >
              <h3
                id={`cheatsheet-surf-${surface}`}
                className="text-xs font-semibold uppercase tracking-wider text-meta"
              >
                {SURFACE_LABELS[surface]} ({items.length})
              </h3>

              <div className="overflow-x-auto rounded-xl border border-[var(--border-color)]">
                <table className="w-full text-xs">
                  <caption className="sr-only">
                    {SURFACE_LABELS[surface]} keyboard shortcuts
                  </caption>
                  <thead>
                    <tr className="border-b border-[var(--border-color)] text-left bg-[var(--hover-bg)]">
                      <th scope="col" className="py-2 px-3">Command</th>
                      <th scope="col" className="py-2 px-3">Scope</th>
                      <th scope="col" className="py-2 px-3">Key Binding</th>
                      <th scope="col" className="py-2 px-3">Non-Keyboard UI Alternative</th>
                      <th scope="col" className="py-2 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-[var(--border-color)]"
                      >
                        <th scope="row" className="py-2.5 px-3 font-medium text-left">
                          <div>{item.title}</div>
                          <div className="text-[11px] text-meta font-normal">
                            {item.description}
                          </div>
                          {item.privileged && (
                            <span className="inline-block mt-1 rounded bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 text-[10px] font-semibold">
                              Audit-safe confirmation required
                            </span>
                          )}
                        </th>
                        <td className="py-2.5 px-3 font-mono">{item.scope}</td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <kbd className="rounded border border-[var(--border-color)] bg-[var(--hover-bg)] px-2 py-1 font-mono text-xs font-semibold">
                            {item.enabled
                              ? formatShortcutForPlatform(
                                  item.effectiveBinding,
                                  platformFormat,
                                )
                              : 'Disabled'}
                          </kbd>
                          {item.isCustomized && (
                            <span className="ml-1.5 text-[10px] text-meta">
                              (custom)
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-meta">
                          {item.nonKeyboardAlternative}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {onTriggerCommand && item.enabled && (
                            <button
                              type="button"
                              onClick={() => onTriggerCommand(item.id)}
                              className="btn-outline text-xs px-2.5 py-1"
                            >
                              Run
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default ShortcutCheatSheet;
