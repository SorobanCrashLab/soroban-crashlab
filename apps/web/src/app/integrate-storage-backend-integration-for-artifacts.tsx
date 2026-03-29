'use client';

/**
 * Issue #XXX – Integrate: Storage backend integration for artifacts
 *
 * This integration page enables uploading, listing, and downloading
 * artifacts from a storage backend (mocked for now).
 */

import React, { useState, useEffect, useCallback } from 'react';

// --- Types ---

export type Artifact = {
  id: string;
  name: string;
  createdAt: string;
  sizeBytes?: number;
  mimeType?: string;
  url?: string;
};

// --- API Client Layer (Mocked) ---

/**
 * Simulates uploading an artifact to the backend.
 * POST /api/artifacts
 */
async function uploadArtifact(file: File): Promise<Artifact> {
  // TODO: Replace with real fetch call when backend is available
  console.log('Uploading file:', file.name);
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // In a real implementation, the backend would return the metadata
  const newArtifact: Artifact = {
    id: `art-${Math.random().toString(36).substring(2, 9)}`,
    name: file.name,
    createdAt: new Date().toISOString(),
    sizeBytes: file.size,
    mimeType: file.type || 'application/octet-stream',
    // In a real app, this would be a signed URL or direct storage link
    url: URL.createObjectURL(file), 
  };
  
  return newArtifact;
}

/**
 * Simulates fetching the list of artifacts from the backend.
 * GET /api/artifacts
 */
async function fetchArtifacts(): Promise<Artifact[]> {
  // TODO: Replace with real fetch call when backend is available
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Mock data representing previously uploaded artifacts
  return [
    {
      id: 'art-101',
      name: 'run-942-crash-bundle.json',
      createdAt: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
      sizeBytes: 15420,
      mimeType: 'application/json',
    },
    {
      id: 'art-102',
      name: 'soroban-auth-trace-v1.bin',
      createdAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      sizeBytes: 892100,
      mimeType: 'application/octet-stream',
    }
  ];
}

/**
 * Simulates downloading artifact content from the backend.
 * GET /api/artifacts/:id
 */
async function downloadArtifactContent(id: string): Promise<Blob> {
  // TODO: Replace with real fetch call when backend is available
  console.log('Downloading artifact content for ID:', id);
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 800));
  
  // Return a dummy JSON blob for demonstration
  const dummyData = { 
    id, 
    source: 'Soroban CrashLab Storage Backend',
    timestamp: new Date().toISOString(),
    content: 'This is a mock artifact payload retrieved from the storage backend.' 
  };
  
  return new Blob([JSON.stringify(dummyData, null, 2)], { type: 'application/json' });
}

// --- Helper Functions ---

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatFileSize(bytes?: number): string {
  if (bytes === undefined) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// --- Main Component ---

export default function ArtifactStorageIntegration() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const loadArtifacts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchArtifacts();
      setArtifacts(data);
    } catch (err) {
      setError('Failed to load artifacts from storage backend.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadArtifacts();
  }, [loadArtifacts]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);
    try {
      const newArtifact = await uploadArtifact(file);
      setArtifacts(prev => [newArtifact, ...prev]);
    } catch (err) {
      setError('Upload failed. Please check backend connectivity.');
      console.error(err);
    } finally {
      setIsUploading(false);
      // Reset input so the same file can be uploaded again if needed
      event.target.value = '';
    }
  };

  const handleDownload = async (artifact: Artifact) => {
    setDownloadingId(artifact.id);
    try {
      const blob = await downloadArtifactContent(artifact.id);
      triggerBrowserDownload(blob, artifact.name);
    } catch (err) {
      setError(`Failed to download ${artifact.name}.`);
      console.error(err);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8 font-sans">
      <header className="mb-8 border-b border-gray-200 pb-4">
        <h1 className="text-3xl font-bold text-gray-900">Artifact Storage Integration</h1>
        <p className="text-gray-600 mt-2">
          Connect your fuzzing runs to persistent storage for regression analysis and sharing.
        </p>
      </header>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded shadow-sm">
          <div className="flex items-center">
            <span className="text-red-700 font-medium">{error}</span>
            <button 
              onClick={() => setError(null)}
              className="ml-auto text-red-500 hover:text-red-700 font-bold"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {/* Upload Section */}
      <section className="bg-gray-50 rounded-xl p-6 mb-10 border border-gray-200 shadow-sm">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 flex items-center">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="替代4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Upload New Artifact
        </h2>
        
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="relative w-full sm:w-auto">
            <input 
              type="file" 
              id="artifact-upload"
              className="sr-only"
              onChange={handleFileUpload} 
              disabled={isUploading}
            />
            <label 
              htmlFor="artifact-upload"
              className={`
                flex items-center justify-center px-6 py-3 rounded-lg border-2 border-dashed
                transition-all cursor-pointer text-center
                ${isUploading 
                  ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed' 
                  : 'bg-white border-blue-300 text-blue-600 hover:border-blue-500 hover:bg-blue-50'}
              `}
            >
              {isUploading ? (
                <span className="flex items-center">
                  <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Uploading...
                </span>
              ) : 'Select File to Upload'}
            </label>
          </div>
          <p className="text-sm text-gray-500 italic">
            Supports JSON, BIN, and CSV formats. Max 10MB.
          </p>
        </div>
      </section>

      {/* Artifact List */}
      <section>
        <div className="flex justify-between items-end mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Stored Artifacts</h2>
          <button 
            onClick={loadArtifacts}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center"
            disabled={isLoading}
          >
            <svg className={`w-4 h-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
        
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse bg-gray-100 h-20 rounded-lg" />
            ))}
          </div>
        ) : artifacts.length === 0 ? (
          <div className="text-center py-20 bg-gray-50 rounded-xl border border-dashed border-gray-300">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p className="text-gray-500 font-medium">No artifacts found in storage</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <ul className="divide-y divide-gray-100">
              {artifacts.map(artifact => (
                <li 
                  key={artifact.id} 
                  className="flex items-center justify-between p-5 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center">
                    <div className="p-3 bg-blue-50 rounded-lg mr-4">
                      <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{artifact.name}</h3>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-sm text-gray-500 font-medium">
                          {formatFileSize(artifact.sizeBytes)}
                        </span>
                        <span className="text-gray-300 text-xs">•</span>
                        <span className="text-sm text-gray-500">
                          {new Date(artifact.createdAt).toLocaleDateString()} at {new Date(artifact.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => handleDownload(artifact)}
                    disabled={downloadingId === artifact.id}
                    className={`
                      px-5 py-2 rounded-lg font-semibold text-sm transition-all
                      ${downloadingId === artifact.id
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-white border border-gray-300 text-gray-700 hover:border-blue-500 hover:text-blue-600 hover:shadow-sm'}
                    `}
                  >
                    {downloadingId === artifact.id ? (
                      <span className="flex items-center">
                        <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Fetching...
                      </span>
                    ) : 'Download'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <footer className="mt-12 pt-8 border-t border-gray-100 text-center">
        <p className="text-sm text-gray-400">
          Soroban CrashLab Artifact Storage • Built with Next.js & Soroban SDK
        </p>
      </footer>
    </div>
  );
}
