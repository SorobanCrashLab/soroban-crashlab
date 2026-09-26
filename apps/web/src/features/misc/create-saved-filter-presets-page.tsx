'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  readPresets,
  savePresets,
  createPreset,
  buildShareUrl,
  exportPresetAsJson,
  importPresetFromJson,
  type FilterPreset,
} from './saved-filter-presets-utils';

export default function CreateSavedFilterPresetsPage() {
  const [presets, setPresets] = useState<FilterPreset[]>(() => (typeof window === 'undefined' ? [] : readPresets()));
  const [hydrated, setHydrated] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newFilters, setNewFilters] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importJson, setImportJson] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate presets from local storage once
    setPresets(readPresets());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) savePresets(presets);
  }, [hydrated, presets]);

  const selectedPreset = useMemo(
    () => presets.find((p) => p.id === selectedId) ?? null,
    [presets, selectedId],
  );

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleCreate = useCallback(() => {
    if (!newName.trim()) return;
    let filters: Record<string, string> = {};
    try {
      filters = newFilters.trim() ? JSON.parse(newFilters) : {};
    } catch {
      showToast('Invalid filters JSON', 'error');
      return;
    }
    const preset = createPreset(newName.trim(), newDescription.trim(), filters);
    setPresets((prev) => [...prev, preset]);
    setSelectedId(preset.id);
    setShowCreateDialog(false);
    setNewName('');
    setNewDescription('');
    setNewFilters('');
    showToast('Filter preset created', 'success');
  }, [newName, newDescription, newFilters, showToast]);

  const handleDelete = useCallback((id: string) => {
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    const ok = window.confirm(`Delete preset "${preset.name}"?`);
    if (!ok) return;
    setPresets((prev) => prev.filter((p) => p.id !== id));
    if (selectedId === id) setSelectedId(null);
    showToast('Filter preset deleted', 'success');
  }, [presets, selectedId, showToast]);

  const handleShare = useCallback((preset: FilterPreset) => {
    const url = buildShareUrl(preset.filters);
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      showToast('Share URL copied to clipboard', 'success');
    }).catch(() => {
      showToast('Failed to copy URL', 'error');
    });
  }, [showToast]);

  const handleExport = useCallback((preset: FilterPreset) => {
    const json = exportPresetAsJson(preset);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${preset.name.replace(/\s+/g, '-').toLowerCase()}-preset.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Filter preset exported', 'success');
  }, [showToast]);

  const handleImport = useCallback(() => {
    const preset = importPresetFromJson(importJson);
    if (!preset) {
      showToast('Invalid JSON format', 'error');
      return;
    }
    setPresets((prev) => [preset, ...prev]);
    setSelectedId(preset.id);
    setShowImportDialog(false);
    setImportJson('');
    showToast('Filter preset imported', 'success');
  }, [importJson, showToast]);

  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const preset = importPresetFromJson(text);
      if (!preset) {
        showToast('Invalid preset file', 'error');
        return;
      }
      setPresets((prev) => [preset, ...prev]);
      setSelectedId(preset.id);
      showToast('Filter preset imported from file', 'success');
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [showToast]);

  if (!hydrated) {
    return (
      <div className="card card-padding animate-pulse">
        <div className="h-8 w-48 rounded bg-zinc-200 dark:bg-zinc-800" />
      </div>
    );
  }

  return (
    <section aria-label="Saved filter presets" className="w-full">
      <div className="mb-6">
        <h1 className="heading-page">Saved Filter Presets</h1>
        <p className="text-meta mt-1 text-sm">
          Create, share, and manage named filter presets for quick access to filtered views.
        </p>
      </div>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 text-rose-800 dark:bg-rose-900/20 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => setShowCreateDialog(true)}
          className="px-4 py-2 rounded-xl bg-[#0A66C2] text-white text-sm font-semibold hover:bg-[#0A66C2]/90 transition"
        >
          New Preset
        </button>
        <button
          type="button"
          onClick={() => setShowImportDialog(true)}
          className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
        >
          Import JSON
        </button>
        <label className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer">
          Import File
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileImport}
            className="sr-only"
          />
        </label>
      </div>

      {presets.length === 0 ? (
        <div className="card card-padding text-center py-12">
          <p className="text-meta text-sm">No saved filter presets yet.</p>
          <p className="text-xs text-meta mt-1">Create a preset to save and share filter configurations.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {presets.map((preset) => (
            <div
              key={preset.id}
              className={`card card-padding flex flex-col gap-3 ${
                selectedId === preset.id ? 'ring-2 ring-[#0A66C2]' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3
                    className="font-semibold text-sm truncate cursor-pointer text-[var(--text-primary)]"
                    onClick={() => setSelectedId(preset.id)}
                  >
                    {preset.name}
                  </h3>
                  {preset.description && (
                    <p className="text-meta text-xs mt-0.5 line-clamp-2">{preset.description}</p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 text-xs">
                {Object.entries(preset.filters).slice(0, 4).map(([key, value]) => (
                  <span key={key} className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                    {key}: {value.length > 20 ? value.slice(0, 20) + '...' : value}
                  </span>
                ))}
                {Object.keys(preset.filters).length > 4 && (
                  <span className="text-meta">+{Object.keys(preset.filters).length - 4} more</span>
                )}
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-[var(--border)]">
                <span className="text-[11px] text-meta">
                  {new Date(preset.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => handleShare(preset)}
                    className="text-xs px-2 py-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                    title="Copy share URL"
                    aria-label="Copy share URL"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport(preset)}
                    className="text-xs px-2 py-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                    title="Export as JSON"
                    aria-label="Export as JSON"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(preset.id)}
                    className="text-xs px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition text-zinc-400 hover:text-red-500"
                    title="Delete preset"
                    aria-label="Delete preset"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedPreset && (
        <div className="mt-6 card card-padding">
          <h2 className="font-semibold text-sm mb-3 text-[var(--text-primary)]">
            {selectedPreset.name} &mdash; Filters
          </h2>
          {Object.keys(selectedPreset.filters).length === 0 ? (
            <p className="text-meta text-sm">No filters configured.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800">
                    <th scope="col" className="text-left py-2 pr-4 font-medium text-meta">Field</th>
                    <th scope="col" className="text-left py-2 font-medium text-meta">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(selectedPreset.filters).map(([key, value]) => (
                    <tr key={key} className="border-b border-zinc-100 dark:border-zinc-800/50">
                      <td className="py-2 pr-4 font-mono text-xs">{key}</td>
                      <td className="py-2 text-xs">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 w-full max-w-lg shadow-2xl">
            <h2 className="font-semibold text-base mb-4 text-[var(--text-primary)]">New Filter Preset</h2>
            <div className="space-y-4">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-meta">Name</span>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm"
                  placeholder="My Filter Preset"
                  autoFocus
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-meta">Description</span>
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm"
                  placeholder="Optional description"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-meta">Filters (JSON)</span>
                <textarea
                  value={newFilters}
                  onChange={(e) => setNewFilters(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm font-mono"
                  placeholder='{"status": "failed", "severity": "critical"}'
                  rows={4}
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setShowCreateDialog(false)}
                className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!newName.trim()}
                className="px-4 py-2 rounded-xl bg-[#0A66C2] text-white text-sm font-semibold hover:bg-[#0A66C2]/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 w-full max-w-lg shadow-2xl">
            <h2 className="font-semibold text-base mb-4 text-[var(--text-primary)]">Import Filter Preset</h2>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-meta">Paste JSON</span>
              <textarea
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm font-mono"
                placeholder='{"name": "My Preset", "filters": {"status": "failed"}}'
                rows={6}
                autoFocus
              />
            </label>
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setShowImportDialog(false)}
                className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={!importJson.trim()}
                className="px-4 py-2 rounded-xl bg-[#0A66C2] text-white text-sm font-semibold hover:bg-[#0A66C2]/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
