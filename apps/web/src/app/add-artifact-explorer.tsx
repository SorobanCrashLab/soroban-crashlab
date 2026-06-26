'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import ArtifactPreviewModal from './implement-artifact-preview-modal-component';
import { useDebounce } from '../lib/useDebounce';
import { api } from '../lib/api-client';
import type { Artifact } from './types';

export type { Artifact };

const MOCK_ARTIFACTS: Artifact[] = [
  { id: 'art-001', name: 'seed_2026_03_29_001.bin', type: 'seed', size: 1024 * 45, updatedAt: '2026-03-29T10:00:00Z', runId: 'run-1000', content_hash: 'a1b2c3d4' },
  { id: 'art-002', name: 'fuzzer_stdout.log', type: 'log', size: 1024 * 128, updatedAt: '2026-03-29T10:05:00Z', runId: 'run-1000' },
  { id: 'art-003', name: 'execution_trace.json', type: 'trace', size: 1024 * 1024 * 2.5, updatedAt: '2026-03-29T10:10:00Z', runId: 'run-1001', content_hash: 'e5f6g7h8' },
  { id: 'art-004', name: 'coverage_report_nightly.zip', type: 'coverage', size: 1024 * 512, updatedAt: '2026-03-29T09:30:00Z' },
  { id: 'art-005', name: 'mutant_envelope_fail.xdr', type: 'seed', size: 1024 * 12, updatedAt: '2026-03-28T22:00:00Z', runId: 'run-1005' },
  { id: 'art-006', name: 'bundle_archive.tar.gz', type: 'bundle', size: 1024 * 1024 * 15.2, updatedAt: '2026-03-28T18:45:00Z' },
];

export function mapMetadataToArtifact(meta: { id: string; name: string; createdAt: string; sizeBytes: number }): Artifact {
  const lowerName = meta.name.toLowerCase();
  let type: Artifact['type'] = 'seed';
  
  if (lowerName.endsWith('.log') || lowerName.includes('log') || lowerName.endsWith('.txt')) {
    type = 'log';
  } else if (lowerName.endsWith('.json') || lowerName.includes('trace') || lowerName.includes('steps')) {
    type = 'trace';
  } else if (lowerName.endsWith('.zip') || lowerName.includes('coverage') || lowerName.endsWith('.html')) {
    type = 'coverage';
  } else if (lowerName.endsWith('.tar.gz') || lowerName.endsWith('.tgz') || lowerName.includes('bundle') || lowerName.includes('archive')) {
    type = 'bundle';
  } else if (lowerName.endsWith('.bin') || lowerName.endsWith('.xdr') || lowerName.includes('seed') || lowerName.includes('mutant')) {
    type = 'seed';
  }

  // Extract optional run ID (e.g., "run-1000")
  const runIdMatch = meta.name.match(/(run-\d+)/i) || meta.name.match(/(run_\d+)/i);
  const runId = runIdMatch ? runIdMatch[1] : undefined;

  // Extract optional hex hash (e.g. SHA256) delimited by _, -, boundaries, or dots
  const hashMatch = meta.name.match(/(?:_|-|\b)([a-fA-F0-9]{8,64})(?:\.|\b|_|-)/);
  const content_hash = hashMatch ? hashMatch[1] : undefined;

  return {
    id: meta.id,
    name: meta.name,
    type,
    size: meta.sizeBytes,
    updatedAt: meta.createdAt,
    runId,
    content_hash,
  };
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function ArtifactExplorer() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [filter, setFilter] = useState<'all' | Artifact['type']>('all');
  const [previewArtifact, setPreviewArtifact] = useState<Artifact | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewDataState, setPreviewDataState] = useState<'loading' | 'error' | 'success'>('success');

  const loadArtifacts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.artifacts.list();
      const mapped = (data.artifacts || []).map(mapMetadataToArtifact);
      setArtifacts(mapped);
    } catch (err) {
      console.warn('Failed to load real artifacts, falling back to mock data:', err);
      setError('Sandbox Mode: Sync with local storage failed. Displaying simulated artifacts.');
      setArtifacts(MOCK_ARTIFACTS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadArtifacts();
  }, [loadArtifacts]);

  const filteredArtifacts = useMemo(() => {
    return artifacts.filter(a => {
      const matchesSearch = a.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                            a.runId?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                            a.content_hash?.toLowerCase().includes(debouncedSearch.toLowerCase());
      const matchesFilter = filter === 'all' || a.type === filter;
      return matchesSearch && matchesFilter;
    });
  }, [artifacts, debouncedSearch, filter]);

  const handlePreviewArtifact = (artifact: Artifact) => {
    setPreviewArtifact(artifact);
    setPreviewDataState('loading');
    setIsPreviewOpen(true);
    
    // Simulate loading delay
    setTimeout(() => {
      // Simulate occasional errors for testing
      if (Math.random() < 0.1) {
        setPreviewDataState('error');
      } else {
        setPreviewDataState('success');
      }
    }, 800);
  };

  const handleClosePreview = () => {
    setIsPreviewOpen(false);
    setPreviewArtifact(null);
    setPreviewDataState('success');
  };

  const handleRetryPreview = () => {
    setPreviewDataState('loading');
    setTimeout(() => {
      setPreviewDataState('success');
    }, 500);
  };

  const handleDownload = async (artifact: Artifact) => {
    setDownloadingId(artifact.id);
    try {
      const blob = await api.artifacts.download(artifact.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = artifact.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert(`Failed to fetch artifact: ${artifact.name}`);
    } finally {
      setDownloadingId(null);
    }
  };

  const typeStyles = {
    seed: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800',
    log: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
    trace: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800',
    coverage: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800',
    bundle: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700',
  };

  return (
    <>
      {error && (
        <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl text-sm text-amber-700 dark:text-amber-400 flex items-center justify-between shadow-sm animate-fadeIn">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
          <button 
            onClick={() => setError(null)} 
            className="text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 font-bold px-2 py-1"
          >
            &times;
          </button>
        </div>
      )}

      <div className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xl transition-all hover:shadow-2xl">
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/20">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Artifact Explorer</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Manage and inspect fuzzing seeds, logs, and execution traces.</p>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={loadArtifacts}
                disabled={isLoading}
                className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-sm disabled:opacity-50"
              >
                <svg className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Sync Status
              </button>
              <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 rounded-full text-xs font-semibold border border-blue-100 dark:border-blue-800">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
                {artifacts.length} Total Artifacts
              </div>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Search by name, run ID, or hash..."
                value={search}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
              />
              <svg className="absolute left-3.5 top-3 w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0">
              {(['all', 'seed', 'log', 'trace', 'coverage'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all border shrink-0 ${
                    filter === t 
                      ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/30' 
                      : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          {isLoading && artifacts.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center gap-4">
              <svg className="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-zinc-500 text-sm font-medium">Syncing with artifact database...</span>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-900/50 text-zinc-400 text-[10px] font-bold uppercase tracking-widest">
                  <th className="px-6 py-4">Artifact Metadata</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Size</th>
                  <th className="px-6 py-4">Source Context</th>
                  <th className="px-6 py-4">Last Updated</th>
                  <th className="px-6 py-4 text-right pr-8">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {filteredArtifacts.map((artifact) => (
                  <tr key={artifact.id} className="group hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <div className={`p-2.5 rounded-xl border ${typeStyles[artifact.type]}`}>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {artifact.type === 'seed' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />}
                            {artifact.type === 'log' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />}
                            {artifact.type === 'trace' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />}
                            {artifact.type === 'coverage' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />}
                            {artifact.type === 'bundle' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />}
                          </svg>
                        </div>
                        <div>
                          <div className="font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors uppercase text-xs tracking-tight">{artifact.name}</div>
                          {artifact.content_hash && (
                            <div className="text-[10px] font-mono text-zinc-400 mt-0.5">SHA256: {artifact.content_hash}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${typeStyles[artifact.type]}`}>
                        {artifact.type}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{formatSize(artifact.size)}</span>
                    </td>
                    <td className="px-6 py-5">
                      {artifact.runId ? (
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{artifact.runId}</span>
                          <span className="text-[10px] text-zinc-500 uppercase">Associated Run</span>
                        </div>
                      ) : (
                        <span className="text-sm text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-5">
                      <div className="text-sm text-zinc-600 dark:text-zinc-400 font-medium whitespace-nowrap">
                        {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(artifact.updatedAt))}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right pr-8">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handlePreviewArtifact(artifact)}
                          className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all shadow-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
                          aria-label={`Preview artifact ${artifact.name}`}
                          title="Preview artifact content"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => handleDownload(artifact)}
                          disabled={downloadingId === artifact.id}
                          className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg text-xs font-bold hover:bg-zinc-800 dark:hover:bg-white transition-all shadow-lg active:scale-95 disabled:opacity-50"
                        >
                          {downloadingId === artifact.id ? (
                            <>
                              <svg className="animate-spin h-3.5 w-3.5 mr-1" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              Fetching...
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                              Fetch
                            </>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredArtifacts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-24 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-full text-zinc-300">
                          <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </div>
                        <span className="text-zinc-500 font-medium">No artifacts found matching your search criteria.</span>
                        <button onClick={() => {setSearch(''); setFilter('all');}} className="text-blue-600 dark:text-blue-400 text-sm font-bold hover:underline underline-offset-4">Reset Filters</button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Artifact Preview Modal */}
      <ArtifactPreviewModal
        artifact={previewArtifact}
        isOpen={isPreviewOpen}
        onClose={handleClosePreview}
        dataState={previewDataState}
        onRetry={handleRetryPreview}
        errorMessage="Failed to load artifact preview. The artifact may be corrupted or temporarily unavailable."
      />
    </>
  );
}
