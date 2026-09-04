'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildEmbedSnippet,
  buildShareUrl,
  checkUrlLength,
  decodeViewState,
  encodeViewState,
  type ViewState,
} from './view-state';
import {
  addView,
  createLocalSavedViewGateway,
  createSavedView,
  deleteView,
  renameView,
  validateViewName,
  type SavedView,
} from './view-store';

interface SavedViewsMenuProps {
  state: ViewState;
  onApply: (state: ViewState) => void;
  /** Path the share link points at. */
  path?: string;
}

const EMBED_HEIGHT_OPTIONS = [400, 600, 800];

export default function SavedViewsMenu({ state, onApply, path = '/runs' }: SavedViewsMenuProps) {
  const gateway = useMemo(() => createLocalSavedViewGateway(), []);
  // Everything below reads localStorage or window.location, so nothing renders
  // until after mount — the server HTML and the first client paint match.
  const [mounted, setMounted] = useState(false);
  const [views, setViews] = useState<SavedView[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [embedHeight, setEmbedHeight] = useState(EMBED_HEIGHT_OPTIONS[1]);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      setMounted(true);
      setViews(gateway.list());
    });
  }, [gateway]);

  const persist = useCallback(
    (next: SavedView[]) => {
      setViews(next);
      try {
        gateway.save(next);
      } catch {
        setNameError('Could not save — browser storage is unavailable.');
      }
    },
    [gateway],
  );

  const shareUrl = mounted ? buildShareUrl(window.location.origin, path, state) : '';
  const lengthCheck = checkUrlLength(shareUrl);

  const handleSave = () => {
    const error = validateViewName(draftName, views);
    if (error) {
      setNameError(error);
      return;
    }
    setNameError(null);
    persist(addView(views, createSavedView(draftName, state, new Date().toISOString())));
    setDraftName('');
  };

  const handleRename = (view: SavedView) => {
    const next = window.prompt('Rename view', view.name);
    if (next === null) return;
    persist(renameView(views, view.id, next, new Date().toISOString()));
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  };

  if (!mounted) {
    // Placeholder keeps the toolbar from shifting when the menu appears.
    return <div className="h-8 w-[13.5rem]" aria-hidden />;
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          className="btn-outline text-xs sm:text-sm px-3 h-8 sm:h-10"
        >
          Views ({views.length})
        </button>

        {menuOpen && (
          <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex gap-2">
              <label htmlFor="view-name" className="sr-only">
                View name
              </label>
              <input
                id="view-name"
                value={draftName}
                onChange={(event) => {
                  setDraftName(event.target.value);
                  setNameError(null);
                }}
                placeholder="Name this view…"
                className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
              <button
                type="button"
                onClick={handleSave}
                className="rounded-lg bg-[#0A66C2] px-3 py-1.5 text-sm font-semibold text-white"
              >
                Save
              </button>
            </div>
            {nameError && (
              <p role="alert" className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                {nameError}
              </p>
            )}

            <ul className="mt-3 space-y-1">
              {views.length === 0 && (
                <li className="text-meta text-xs">No saved views yet.</li>
              )}
              {views.map((view) => (
                <li key={view.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onApply(decodeViewState(view.encoded));
                      setMenuOpen(false);
                    }}
                    className="flex-1 truncate rounded-lg px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    {view.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRename(view)}
                    className="text-xs text-meta underline"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => persist(deleteView(views, view.id))}
                    className="text-xs text-rose-600 underline dark:text-rose-400"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setShareOpen(true)}
        className="btn-outline text-xs sm:text-sm px-3 h-8 sm:h-10"
      >
        Share
      </button>

      {shareOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Share this view"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShareOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-6 py-5 dark:border-zinc-800">
              <div>
                <h2 className="text-lg font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                  Share this view
                </h2>
                <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Anyone with the link will see the same filters, search, sorting and page.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                aria-label="Close dialog"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-700 dark:bg-zinc-900">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                  What&apos;s included
                </h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {state.search ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
                      <span className="text-zinc-400">Search</span>
                      <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                        “{state.search}”
                      </span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700" style={{ color: 'var(--text-secondary)' }}>
                      No search
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
                    <span className="text-zinc-400">Sort</span>
                    <span style={{ color: 'var(--text-primary)' }}>
                      {state.sort.key} · {state.sort.direction}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
                    <span className="text-zinc-400">Page</span>
                    <span style={{ color: 'var(--text-primary)' }}>{state.page}</span>
                  </span>
                  {state.filters.status.map((value) => (
                    <span key={`st-${value}`} className="inline-flex rounded-full bg-[#0A66C2] px-3 py-1 text-xs font-semibold text-white">
                      status:{value}
                    </span>
                  ))}
                  {state.filters.area.map((value) => (
                    <span key={`ar-${value}`} className="inline-flex rounded-full bg-[#0A66C2] px-3 py-1 text-xs font-semibold text-white">
                      area:{value}
                    </span>
                  ))}
                  {state.filters.severity.map((value) => (
                    <span key={`sv-${value}`} className="inline-flex rounded-full bg-[#0A66C2] px-3 py-1 text-xs font-semibold text-white">
                      severity:{value}
                    </span>
                  ))}
                  {state.filters.hasCrash !== null && (
                    <span className="inline-flex rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-white">
                      hasCrash:{state.filters.hasCrash ? 'yes' : 'no'}
                    </span>
                  )}
                  {state.columns.length > 0 ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
                      <span className="text-zinc-400">Columns</span>
                      <span style={{ color: 'var(--text-primary)' }}>{state.columns.join(', ')}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700" style={{ color: 'var(--text-secondary)' }}>
                      Default columns
                    </span>
                  )}
                  {state.filters.status.length === 0 &&
                    state.filters.area.length === 0 &&
                    state.filters.severity.length === 0 &&
                    state.filters.hasCrash === null &&
                    state.columns.length === 0 &&
                    !state.search && (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900">
                        No active filters — full runs list
                      </span>
                    )}
                </div>
                <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Row selection, open drawers and live-refresh are not shared — the recipient gets a clean view.
                </p>
              </div>

              {lengthCheck.tooLong && (
                <p
                  role="alert"
                  className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                >
                  {lengthCheck.message}
                </p>
              )}

              <div className="mt-6">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="share-url" className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                    Share link
                  </label>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${lengthCheck.tooLong ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                    {lengthCheck.length} characters
                  </span>
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    id="share-url"
                    readOnly
                    value={shareUrl}
                    onFocus={(event) => event.target.select()}
                    className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 font-mono text-xs leading-relaxed break-all dark:border-zinc-700 dark:bg-zinc-950"
                  />
                  <button
                    type="button"
                    onClick={() => void copy(shareUrl, 'link')}
                    className="shrink-0 rounded-xl bg-[#0A66C2] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#004182] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A66C2]"
                  >
                    {copied === 'link' ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                  >
                    Open in new tab
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                      <path d="M4.5 3H9V7.5M9 3L3 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </a>
                  <span className="inline-flex items-center text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Recipients need no account — link opens the filtered view directly.
                  </span>
                </div>
              </div>

              <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Embed this view</h3>
                  <label htmlFor="embed-height" className="sr-only">
                    Embed height
                  </label>
                  <select
                    id="embed-height"
                    value={embedHeight}
                    onChange={(event) => setEmbedHeight(Number(event.target.value))}
                    className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    {EMBED_HEIGHT_OPTIONS.map((height) => (
                      <option key={height} value={height}>
                        {height}px height
                      </option>
                    ))}
                  </select>
                </div>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Paste into any page that allows iframes. Height controls the initial frame size.
                </p>
                <textarea
                  readOnly
                  rows={3}
                  aria-label="Embed snippet"
                  value={buildEmbedSnippet(shareUrl, embedHeight)}
                  onFocus={(event) => event.target.select()}
                  className="mt-3 w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 font-mono text-[11px] leading-relaxed break-all dark:border-zinc-700 dark:bg-zinc-950"
                />
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void copy(buildEmbedSnippet(shareUrl, embedHeight), 'embed')}
                    className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                  >
                    {copied === 'embed' ? 'Copied ✓' : 'Copy embed code'}
                  </button>
                </div>
              </div>

              <details className="mt-4 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
                <summary className="cursor-pointer list-none text-xs font-semibold text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
                  Raw encoded state (for debugging)
                </summary>
                <p className="mt-2 break-all font-mono text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {encodeViewState(state) || '(default view — no parameters)'}
                </p>
              </details>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/70 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900/50">
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-black dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
