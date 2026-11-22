'use client';

/**
 * ShortcutSettings — interactive keyboard shortcut remapping, conflict
 * detection/resolution, workspace profile switching, JSON import/export,
 * cheat sheet preview, and audit-safe privileged action confirmation (#2315).
 */

import React, { useMemo, useState } from 'react';
import { ShortcutCheatSheet } from './ShortcutCheatSheet';
import { useShortcutContext } from './ShortcutProvider';
import type { ShortcutConflictIssue } from './conflictResolution';
import type { ShortcutSurface } from './shortcutRegistry';

export function ShortcutSettings() {
  const ctx = useShortcutContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [surfaceFilter, setSurfaceFilter] = useState<ShortcutSurface | 'all'>('all');
  const [editingCommandId, setEditingCommandId] = useState<string | null>(null);
  const [proposedCombo, setProposedCombo] = useState('');
  const [activeConflict, setActiveConflict] =
    useState<ShortcutConflictIssue | null>(null);

  // Import/export modal/drawer state
  const [importExportJson, setImportExportJson] = useState('');
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const filteredBindings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ctx.bindings.filter((b) => {
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
  }, [ctx.bindings, searchQuery, surfaceFilter]);

  const startRemap = (commandId: string, currentBinding: string) => {
    setEditingCommandId(commandId);
    setProposedCombo(currentBinding);
    setActiveConflict(null);
  };

  const commitRemap = (commandId: string, comboToApply = proposedCombo) => {
    const result = ctx.remapShortcut(commandId, comboToApply);
    if (result.ok) {
      setEditingCommandId(null);
      setProposedCombo('');
      setActiveConflict(null);
    } else if (result.conflict) {
      setActiveConflict(result.conflict);
    }
  };

  const handleExport = () => {
    setImportErrors([]);
    setImportExportJson(ctx.exportProfileJson());
  };

  const handleImport = () => {
    if (!importExportJson.trim()) return;
    const res = ctx.importProfileJson(importExportJson);
    setImportErrors(res.errors);
  };

  return (
    <div className="space-y-8" data-testid="shortcut-settings-center">
      {/* Live Screen-Reader Status Announcer */}
      <div role="status" aria-live="polite" className="sr-only">
        {ctx.statusAnnouncement}
      </div>

      {ctx.statusAnnouncement && (
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--hover-bg)] px-4 py-2.5 text-xs">
          {ctx.statusAnnouncement}
        </div>
      )}

      {/* Audit-Safe Privileged Command Confirmation Dialog */}
      {ctx.pendingConfirmation && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="priv-confirm-title"
          aria-describedby="priv-confirm-desc"
          className="rounded-xl border-2 border-amber-500 bg-amber-50/90 dark:bg-amber-950/50 p-4 space-y-3"
        >
          <h2 id="priv-confirm-title" className="text-sm font-bold">
            Confirm privileged keyboard action: {ctx.pendingConfirmation.command.title}
          </h2>
          <p id="priv-confirm-desc" className="text-xs">
            Audit-safe guardrail: destructive or privileged actions triggered via keyboard shortcuts ({ctx.pendingConfirmation.command.effectiveBinding}) require explicit confirmation before executing.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={ctx.confirmPrivilegedAction}
              className="btn-primary text-xs px-3 py-1.5"
            >
              Confirm execution
            </button>
            <button
              type="button"
              onClick={ctx.cancelPrivilegedAction}
              className="btn-outline text-xs px-3 py-1.5"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Profile Scope, Cheat Sheet Toggle & Reset Controls */}
      <section aria-labelledby="shortcut-scope-heading" className="card card-padding space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 id="shortcut-scope-heading" className="heading-section mb-1">
              Workspace shortcut profiles &amp; discoverability
            </h2>
            <p className="text-meta">
              Customize bindings per workspace scope with telemetry-free local persistence, conflict resolution, and instant cheat-sheet reference.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label className="text-xs font-medium flex items-center gap-2">
              <span>Workspace scope:</span>
              <select
                aria-label="Select shortcut workspace scope"
                value={ctx.workspaceScope}
                onChange={(e) => ctx.setWorkspaceScope(e.target.value)}
                className="form-input text-xs py-1.5"
              >
                <option value="global">Global (All Workspaces)</option>
                <option value="triage-ops">Workspace: triage-ops</option>
                <option value="contract-audit">Workspace: contract-audit</option>
                <option value="incident-review">Workspace: incident-review</option>
              </select>
            </label>

            <button
              type="button"
              aria-pressed={ctx.cheatSheetOpen}
              onClick={() => ctx.setCheatSheetOpen(!ctx.cheatSheetOpen)}
              className="btn-primary text-xs px-3 py-1.5"
            >
              {ctx.cheatSheetOpen ? 'Hide Cheat Sheet' : 'Open Cheat Sheet (?)'}
            </button>

            <button
              type="button"
              onClick={ctx.resetAllToDefaults}
              className="btn-outline text-xs px-3 py-1.5"
            >
              Reset all to defaults
            </button>
          </div>
        </div>
      </section>

      {/* Embedded Cheat Sheet Reference Modal/Panel */}
      <ShortcutCheatSheet
        bindings={ctx.bindings}
        isOpen={ctx.cheatSheetOpen}
        onClose={() => ctx.setCheatSheetOpen(false)}
        onTriggerCommand={(id) => ctx.triggerCommandById(id)}
      />

      {/* Active Conflict / Guardrail Banner */}
      {activeConflict && (
        <section
          role="alert"
          aria-labelledby="conflict-alert-heading"
          className="rounded-xl border border-red-400 bg-red-50/80 dark:bg-red-950/30 p-4 space-y-2 text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong id="conflict-alert-heading" className="text-sm text-red-800 dark:text-red-200">
              Shortcut conflict detected ({activeConflict.kind})
            </strong>
            {editingCommandId && (
              <button
                type="button"
                onClick={() =>
                  commitRemap(editingCommandId, activeConflict.suggestedAlternative)
                }
                className="btn-primary text-xs px-3 py-1"
              >
                Apply safe fallback ({activeConflict.suggestedAlternative})
              </button>
            )}
          </div>
          <p className="text-red-700 dark:text-red-300">{activeConflict.message}</p>
        </section>
      )}

      {/* Search, Surface Filter & Remapping Table */}
      <section aria-labelledby="shortcut-remap-heading" className="card card-padding space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 id="shortcut-remap-heading" className="heading-section">
            Command &amp; shortcut registry ({filteredBindings.length})
          </h2>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <label className="text-xs">
              <span className="sr-only">Search shortcuts to remap</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search command, chord, or surface..."
                className="form-input w-full sm:w-64"
              />
            </label>

            <label className="text-xs">
              <span className="sr-only">Filter registry by surface</span>
              <select
                value={surfaceFilter}
                onChange={(e) =>
                  setSurfaceFilter(e.target.value as ShortcutSurface | 'all')
                }
                className="form-input w-full sm:w-48"
              >
                <option value="all">All surfaces</option>
                <option value="global_shell">Global Shell</option>
                <option value="run_workspace">Run Workspace</option>
                <option value="diff">Diff Viewer</option>
                <option value="trace">Trace Inspector</option>
                <option value="logs">Log Console</option>
                <option value="tables">Data Tables</option>
                <option value="canvas">Whiteboard Canvas</option>
              </select>
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <caption className="sr-only">
              Customizable keyboard shortcuts and non-keyboard UI alternatives
            </caption>
            <thead>
              <tr className="border-b border-[var(--border-color)] text-left">
                <th scope="col" className="py-2 pr-3">Command &amp; UI Alternative</th>
                <th scope="col" className="py-2 pr-3">Scope / Surface</th>
                <th scope="col" className="py-2 pr-3">Binding</th>
                <th scope="col" className="py-2 pr-3">Enabled</th>
                <th scope="col" className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBindings.map((item) => {
                const isEditing = editingCommandId === item.id;
                return (
                  <tr
                    key={item.id}
                    className="border-b border-[var(--border-color)]"
                  >
                    <th scope="row" className="py-3 pr-3 font-medium text-left">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>{item.title}</span>
                        {item.privileged && (
                          <span className="rounded border border-amber-400 px-1.5 py-0.5 text-[10px] font-semibold">
                            Privileged · Confirms
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-meta font-normal mt-0.5">
                        {item.description}
                      </div>
                      <div className="text-[11px] text-meta font-normal mt-0.5">
                        <strong>UI alternative:</strong> {item.nonKeyboardAlternative}
                      </div>
                    </th>

                    <td className="py-3 pr-3 font-mono whitespace-nowrap">
                      <div>{item.scope}</div>
                      <div className="text-[11px] text-meta">{item.surface}</div>
                    </td>

                    <td className="py-3 pr-3 whitespace-nowrap">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <label className="sr-only" htmlFor={`remap-input-${item.id}`}>
                            New key combination for {item.title}
                          </label>
                          <input
                            id={`remap-input-${item.id}`}
                            type="text"
                            value={proposedCombo}
                            onChange={(e) => setProposedCombo(e.target.value)}
                            placeholder="e.g., Alt+Shift+N"
                            className="form-input text-xs font-mono w-36 py-1"
                          />
                          <button
                            type="button"
                            onClick={() => commitRemap(item.id)}
                            className="btn-primary text-xs px-2.5 py-1"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCommandId(null);
                              setActiveConflict(null);
                            }}
                            className="btn-outline text-xs px-2 py-1"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div>
                          <kbd className="rounded border border-[var(--border-color)] bg-[var(--hover-bg)] px-2 py-1 font-mono text-xs font-semibold">
                            {item.effectiveBinding}
                          </kbd>
                          {item.isCustomized && (
                            <span className="ml-1.5 text-[10px] text-meta">
                              (default: {item.defaultBinding})
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="py-3 pr-3">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          aria-label={`Enable shortcut for ${item.title}`}
                          onChange={(e) =>
                            ctx.toggleShortcutEnabled(item.id, e.target.checked)
                          }
                        />
                        <span>{item.enabled ? 'On' : 'Off'}</span>
                      </label>
                    </td>

                    <td className="py-3 text-right space-x-1.5 whitespace-nowrap">
                      {!isEditing && (
                        <button
                          type="button"
                          onClick={() => startRemap(item.id, item.effectiveBinding)}
                          className="btn-outline text-xs px-2.5 py-1"
                        >
                          Remap
                        </button>
                      )}
                      {item.isCustomized && (
                        <button
                          type="button"
                          onClick={() => ctx.resetSingleShortcut(item.id)}
                          className="btn-outline text-xs px-2.5 py-1"
                        >
                          Reset
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => ctx.triggerCommandById(item.id)}
                        className="btn-outline text-xs px-2.5 py-1"
                      >
                        Test
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Portable Profile Import / Export Section */}
      <section aria-labelledby="shortcut-import-export-heading" className="card card-padding space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="shortcut-import-export-heading" className="heading-section mb-1">
              Import &amp; export shortcut profile bundle
            </h2>
            <p className="text-meta">
              Share or back up your customized keymap as a schema-validated JSON bundle (reserved OS/browser chords are automatically filtered on import).
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleExport}
              className="btn-outline text-xs px-3 py-1.5"
            >
              Generate export JSON
            </button>
            <button
              type="button"
              onClick={handleImport}
              className="btn-primary text-xs px-3 py-1.5"
            >
              Import JSON profile
            </button>
          </div>
        </div>

        {importErrors.length > 0 && (
          <ul
            role="alert"
            className="rounded-lg border border-amber-400 bg-amber-50/70 dark:bg-amber-950/30 p-3 text-xs space-y-1"
          >
            {importErrors.map((err, idx) => (
              <li key={idx}>• {err}</li>
            ))}
          </ul>
        )}

        <label className="block text-xs font-medium space-y-1">
          <span>Shortcut profile JSON bundle</span>
          <textarea
            rows={5}
            value={importExportJson}
            onChange={(e) => setImportExportJson(e.target.value)}
            placeholder='{"schemaVersion": 1, "profileName": "power-triage", "customBindings": {"diff.next_divergence": "Alt+J"}}'
            className="form-input w-full font-mono text-xs"
          />
        </label>
      </section>
    </div>
  );
}

export default ShortcutSettings;
