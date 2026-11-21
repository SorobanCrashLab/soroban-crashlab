'use client';

/**
 * Unified run investigation workspace (#2257).
 *
 * One route, six synchronized panels, deep-linkable state. Panel state lives in
 * the URL (see ./state/workspace-state) so a triage session can be shared. The
 * component is dynamically imported by the run detail page, keeping it out of
 * that route's first-load JavaScript budget.
 */

import { useCallback, useMemo, useState, useTransition, type KeyboardEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  WORKSPACE_PANELS,
  panelOrder,
  parseWorkspaceState,
  selectWorkspaceItem,
  serializeWorkspaceState,
  togglePanel,
  type WorkspacePanel,
  type WorkspaceSelection,
} from './state/workspace-state';
import { computeVirtualWindow } from './state/virtual-window';
import { createArtifactPreview, formatArtifactSize, type ArtifactMetadata } from './state/artifact-preview';
import { findRunNeighbors, type RunSummary } from './state/run-navigation';
import { canTransition, type TriageStatus } from './state/triage';
import { nextRovingIndex } from '@/lib/a11y/wcag22';

export interface WorkspaceCrash {
  id: string;
  message: string;
  seedIndex?: number;
  timestamp?: string;
}

export interface WorkspaceLogLine {
  line: number;
  text: string;
  level?: 'info' | 'warn' | 'error';
}

export interface WorkspaceArtifact extends ArtifactMetadata {
  id: string;
  content?: string;
  href?: string;
}

export interface RunWorkspaceProps {
  runId: string;
  status: string;
  runs: readonly RunSummary[];
  crashes?: readonly WorkspaceCrash[];
  logs?: readonly WorkspaceLogLine[];
  artifacts?: readonly WorkspaceArtifact[];
}

const PANEL_LABELS: Record<WorkspacePanel, string> = {
  timeline: 'Timeline',
  crashes: 'Crashes',
  logs: 'Logs',
  artifacts: 'Artifacts',
  triage: 'Triage',
  replay: 'Replay',
};

const PANEL_HINTS: Record<WorkspacePanel, string> = {
  timeline: 'Lifecycle events and phase durations',
  crashes: 'Stack traces grouped by root cause',
  logs: 'Structured console and host output',
  artifacts: 'Generated files and downloadable evidence',
  triage: 'Assign, prioritize and resolve inline',
  replay: 'Deterministic replay and comparison',
};

function levelColor(level: WorkspaceLogLine['level']): string {
  if (level === 'error') return 'text-red-600 dark:text-red-400';
  if (level === 'warn') return 'text-amber-600 dark:text-amber-400';
  return 'text-zinc-600 dark:text-zinc-400';
}

export default function RunWorkspace({
  runId,
  status,
  runs,
  crashes = [],
  logs = [],
  artifacts = [],
}: RunWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [logScrollTop, setLogScrollTop] = useState(0);
  const [triageStatus, setTriageStatus] = useState<TriageStatus>('open');
  const [triageNote, setTriageNote] = useState('');

  const state = useMemo(() => parseWorkspaceState(searchParams), [searchParams]);
  const neighbors = useMemo(() => findRunNeighbors(runs, runId), [runs, runId]);
  const orderedPanels = useMemo(() => panelOrder(state), [state]);
  const visibleLogs = useMemo(() => {
    if (!state.query) return logs;
    const needle = state.query.toLowerCase();
    return logs.filter((line) => line.text.toLowerCase().includes(needle));
  }, [logs, state.query]);
  const logWindow = useMemo(
    () => computeVirtualWindow({
      itemCount: visibleLogs.length,
      itemHeight: 28,
      scrollTop: logScrollTop,
      viewportHeight: 336,
    }),
    [visibleLogs.length, logScrollTop],
  );

  const navigate = useCallback((selection: WorkspaceSelection, mutate?: (params: URLSearchParams) => void) => {
    const base = new URLSearchParams(searchParams.toString());
    base.set('view', 'workspace');
    const nextState = selection && Object.keys(selection).length > 0
      ? selectWorkspaceItem(state, selection)
      : state;
    const serialized = serializeWorkspaceState(nextState, base);
    mutate?.(serialized);
    startTransition(() => router.replace(`${pathname}?${serialized.toString()}`, { scroll: false }));
  }, [pathname, router, searchParams, state]);

  const setPanel = (panel: WorkspacePanel) => navigate({}, (params) => params.set('ws.panel', panel));

  /** WCAG 2.2 roving-tabindex keyboard support for the panel tabs. */
  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'] as const;
    if (!keys.includes(event.key as (typeof keys)[number])) return;
    event.preventDefault();
    const current = orderedPanels.indexOf(state.activePanel);
    const next = nextRovingIndex(orderedPanels.length, current, event.key as (typeof keys)[number]);
    if (next < 0) return;
    const panel = orderedPanels[next];
    setPanel(panel);
    document.getElementById(`ws-tab-${panel}`)?.focus();
  };
  const setLayout = (layout: 'investigation' | 'triage' | 'replay') =>
    navigate({}, (params) => params.set('ws.layout', layout));

  const selectedCrash = crashes.find((crash) => crash.id === state.selectedCrashId) ?? null;
  const selectedArtifact = artifacts.find((artifact) => artifact.id === state.selectedArtifactId) ?? null;
  const preview = selectedArtifact
    ? createArtifactPreview(selectedArtifact, selectedArtifact.content ?? '', 4096)
    : null;

  return (
    <section className="mt-10 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden" aria-labelledby="workspace-heading">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 bg-zinc-50 dark:bg-zinc-900/70 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <h2 id="workspace-heading" className="text-lg font-semibold">Investigation workspace</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Run {runId} · {status} · {neighbors.position} of {neighbors.total}
            {isPending ? ' · updating…' : ''}
          </p>
        </div>
        <nav aria-label="Run neighbors" className="flex items-center gap-2 text-sm">
          {neighbors.previous ? (
            <Link href={`/runs/${encodeURIComponent(neighbors.previous)}?view=workspace`} className="btn-outline text-xs">← Newer</Link>
          ) : (
            <span className="text-xs text-zinc-400" aria-disabled="true">← Newer</span>
          )}
          {neighbors.next ? (
            <Link href={`/runs/${encodeURIComponent(neighbors.next)}?view=workspace`} className="btn-outline text-xs">Older →</Link>
          ) : (
            <span className="text-xs text-zinc-400" aria-disabled="true">Older →</span>
          )}
        </nav>
      </header>

      <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mr-1" id="workspace-layout-label">Layout</span>
        <div role="group" aria-labelledby="workspace-layout-label" className="flex gap-1">
          {(['investigation', 'triage', 'replay'] as const).map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setLayout(preset)}
              aria-pressed={state.layout === preset}
              className={`rounded px-2 py-1 text-xs capitalize ${state.layout === preset ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'bg-zinc-100 dark:bg-zinc-800'}`}
            >
              {preset}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-xs">
          <span className="sr-only">Filter workspace</span>
          <input
            type="search"
            value={state.query}
            onChange={(event) => navigate({}, (params) => params.set('ws.query', event.target.value))}
            placeholder="Filter logs and artifacts"
            className="w-56 max-w-full rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-sm"
          />
        </label>
      </div>

      <div role="tablist" aria-label="Investigation panels" onKeyDown={handleTabKeyDown} className="flex flex-wrap gap-1 px-5 py-3 bg-zinc-50/60 dark:bg-zinc-950/30">
        {orderedPanels.map((panel) => (
          <button
            key={panel}
            type="button"
            role="tab"
            id={`ws-tab-${panel}`}
            aria-selected={state.activePanel === panel}
            aria-controls={`ws-panel-${panel}`}
            tabIndex={state.activePanel === panel ? 0 : -1}
            onClick={() => setPanel(panel)}
            className={`min-h-11 rounded px-3 py-1.5 text-sm ${state.activePanel === panel ? 'bg-blue-600 text-white' : 'bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700'}`}
          >
            {PANEL_LABELS[panel]}
            {state.collapsed.includes(panel) ? ' (hidden)' : ''}
          </button>
        ))}
      </div>

      <div className="grid gap-4 p-5 md:grid-cols-2" aria-live="polite">
        {orderedPanels.map((panel) => {
          if (state.collapsed.includes(panel)) return null;
          const focused = state.activePanel === panel;
          return (
            <section
              key={panel}
              id={`ws-panel-${panel}`}
              role="tabpanel"
              aria-labelledby={`ws-tab-${panel}`}
              tabIndex={0}
              className={`rounded-xl border p-4 min-h-[9rem] ${focused ? 'border-blue-400 dark:border-blue-600 ring-1 ring-blue-200 dark:ring-blue-900' : 'border-zinc-200 dark:border-zinc-800'}`}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <h3 className="font-semibold">{PANEL_LABELS[panel]}</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{PANEL_HINTS[panel]}</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate({}, (params) => {
                    const next = togglePanel(state, panel);
                    params.delete('ws.collapsed');
                    const serialized = serializeWorkspaceState(next);
                    const collapsed = serialized.get('ws.collapsed');
                    if (collapsed) params.set('ws.collapsed', collapsed);
                  })}
                  className="text-xs text-zinc-500 hover:underline"
                  aria-label={`Hide ${PANEL_LABELS[panel]} panel`}
                >
                  Hide
                </button>
              </div>

              {panel === 'timeline' && (
                <ol className="space-y-2 text-sm">
                  {['Queued', 'Compiling', 'Fuzzing', 'Reporting'].map((phase, index) => (
                    <li key={phase} className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-center text-xs leading-5" aria-hidden="true">{index + 1}</span>
                      <span>{phase}</span>
                      {index === 0 && <span className="ml-auto text-xs text-zinc-500">Current</span>}
                    </li>
                  ))}
                </ol>
              )}

              {panel === 'crashes' && (
                <ul className="space-y-2 text-sm">
                  {crashes.length === 0 && <li className="text-zinc-500">No crashes recorded.</li>}
                  {crashes.map((crash) => (
                    <li key={crash.id}>
                      <button
                        type="button"
                        onClick={() => navigate({ crashId: crash.id })}
                        aria-pressed={state.selectedCrashId === crash.id}
                        className="w-full text-left rounded border border-zinc-200 dark:border-zinc-700 px-2 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      >
                        <span className="font-mono text-xs">{crash.id}</span> {crash.message}
                      </button>
                    </li>
                  ))}
                  {selectedCrash && (
                    <li className="rounded bg-zinc-50 dark:bg-zinc-950 p-2 text-xs">
                      Selected: <span className="font-mono">{selectedCrash.id}</span>
                      {selectedCrash.seedIndex !== undefined ? ` · seed ${selectedCrash.seedIndex}` : ''}
                    </li>
                  )}
                </ul>
              )}

              {panel === 'logs' && (
                <div>
                  <label className="block text-xs mb-2">
                    <span className="sr-only">Log line filter</span>
                    <input
                      type="search"
                      value={state.query}
                      onChange={(event) => navigate({}, (params) => params.set('ws.query', event.target.value))}
                      placeholder="Filter log lines"
                      className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-xs"
                    />
                  </label>
                  <div
                    className="h-84 overflow-y-auto rounded border border-zinc-200 dark:border-zinc-800 font-mono text-xs"
                    onScroll={(event) => setLogScrollTop(event.currentTarget.scrollTop)}
                    tabIndex={0}
                    aria-label="Virtualized run logs"
                  >
                    <div style={{ paddingTop: logWindow.paddingTop, paddingBottom: logWindow.paddingBottom }}>
                      {visibleLogs.slice(logWindow.startIndex, logWindow.endIndex).map((line) => (
                        <button
                          key={line.line}
                          type="button"
                          onClick={() => navigate({ logLine: line.line })}
                          aria-pressed={state.selectedLogLine === line.line}
                          className="block w-full text-left h-7 px-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                          <span className="text-zinc-400 mr-2">{line.line}</span>
                          <span className={levelColor(line.level)}>{line.text}</span>
                        </button>
                      ))}
                      {visibleLogs.length === 0 && <p className="p-2 text-zinc-500">No matching log lines.</p>}
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    Showing {Math.max(0, logWindow.endIndex - logWindow.startIndex)} of {visibleLogs.length} lines
                    {state.selectedLogLine !== null ? ` · line ${state.selectedLogLine} selected` : ''}
                  </p>
                </div>
              )}

              {panel === 'artifacts' && (
                <ul className="space-y-2 text-sm">
                  {artifacts.length === 0 && <li className="text-zinc-500">No artifacts produced.</li>}
                  {artifacts.map((artifact) => (
                    <li key={artifact.id} className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => navigate({ artifactId: artifact.id })}
                        aria-pressed={state.selectedArtifactId === artifact.id}
                        className="text-left hover:underline"
                      >
                        {artifact.name}
                      </button>
                      <span className="text-xs text-zinc-500">{formatArtifactSize(artifact.sizeBytes)}</span>
                    </li>
                  ))}
                  {preview && (
                    <li className="rounded border border-zinc-200 dark:border-zinc-700 p-2">
                      <p className="text-xs font-medium mb-1">{preview.kind} preview{preview.truncated ? ' (truncated)' : ''}</p>
                      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-xs font-mono">{preview.text}</pre>
                      {selectedArtifact?.href && (
                        <a href={selectedArtifact.href} download className="text-xs text-blue-600 hover:underline">Download</a>
                      )}
                    </li>
                  )}
                </ul>
              )}

              {panel === 'triage' && (
                <div className="space-y-3 text-sm">
                  <div className="flex flex-wrap gap-2">
                    {(['open', 'investigating', 'confirmed', 'dismissed', 'resolved'] as const).map((next) => (
                      <button
                        key={next}
                        type="button"
                        disabled={!canTransition(triageStatus, next)}
                        aria-pressed={triageStatus === next}
                        onClick={() => setTriageStatus(next)}
                        className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs capitalize disabled:opacity-40"
                      >
                        {next}
                      </button>
                    ))}
                  </div>
                  <label className="block">
                    <span className="text-xs">Triage note</span>
                    <textarea
                      value={triageNote}
                      onChange={(event) => setTriageNote(event.target.value.slice(0, 2000))}
                      rows={3}
                      className="mt-1 w-full rounded border border-zinc-300 dark:border-zinc-700 bg-transparent p-2 text-sm"
                      placeholder="What did you find?"
                    />
                  </label>
                  <p className="text-xs text-zinc-500">Status: {triageStatus} · {triageNote.length}/2000 characters</p>
                </div>
              )}

              {panel === 'replay' && (
                <div className="space-y-3 text-sm">
                  <label className="block">
                    <span className="text-xs">Replay cursor (ms)</span>
                    <input
                      type="range"
                      min={0}
                      max={10_000}
                      step={100}
                      value={state.replayCursorMs ?? 0}
                      onChange={(event) => navigate({ replayCursorMs: Number(event.target.value) })}
                      className="w-full"
                    />
                  </label>
                  <p className="font-mono text-xs text-zinc-500">{state.replayCursorMs ?? 0} ms</p>
                  <Link href={`/runs/${encodeURIComponent(runId)}/replay`} className="btn-outline text-xs">Open full replay</Link>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <footer className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500">
        {WORKSPACE_PANELS.length} panels · state is encoded in the URL · <Link href={`/runs/${encodeURIComponent(runId)}`} className="underline">exit workspace</Link>
      </footer>
    </section>
  );
}
