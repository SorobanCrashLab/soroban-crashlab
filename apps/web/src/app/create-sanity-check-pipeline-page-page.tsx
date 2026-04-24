'use client';

<<<<<<< HEAD
import React, { useState, useCallback, useEffect } from 'react';
import { 
  SanityCheck, 
  PipelineRun, 
  PipelineStatus, 
  CheckCategory,
  toggleSanityCheck,
  createNewPipelineRun 
} from './sanity-check-utils';
=======
import React, { useState, useCallback } from 'react';

export type PipelineStatus = 'idle' | 'running' | 'passed' | 'failed' | 'warning';
export type CheckCategory = 'contract' | 'environment' | 'dependencies' | 'configuration';

export interface SanityCheck {
  id: string;
  name: string;
  description: string;
  category: CheckCategory;
  status: PipelineStatus;
  duration: number;
  lastRun?: Date;
  errorMessage?: string;
  warningMessage?: string;
  enabled: boolean;
}

export interface PipelineRun {
  id: string;
  startedAt: Date;
  finishedAt?: Date;
  status: PipelineStatus;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  warningChecks: number;
}
>>>>>>> 7f26f98 (feat:implement Create Sanity check pipeline page page)

interface SanityCheckPipelinePageProps {
  className?: string;
}

const MOCK_SANITY_CHECKS: SanityCheck[] = [
  {
    id: 'contract-compilation',
    name: 'Contract Compilation',
    description: 'Verify all Soroban contracts compile without errors',
    category: 'contract',
    status: 'passed',
    duration: 2340,
    lastRun: new Date(Date.now() - 15 * 60 * 1000),
    enabled: true,
  },
  {
    id: 'wasm-validation',
    name: 'WASM Validation',
    description: 'Validate generated WASM binaries are well-formed',
    category: 'contract',
    status: 'passed',
    duration: 1120,
    lastRun: new Date(Date.now() - 15 * 60 * 1000),
    enabled: true,
  },
  {
    id: 'stellar-network',
    name: 'Stellar Network Connectivity',
    description: 'Check connection to Stellar test network',
    category: 'environment',
    status: 'warning',
    duration: 890,
    lastRun: new Date(Date.now() - 15 * 60 * 1000),
    warningMessage: 'Network latency higher than expected (>500ms)',
    enabled: true,
  },
  {
    id: 'soroban-cli',
    name: 'Soroban CLI Version',
    description: 'Verify Soroban CLI is installed and up-to-date',
    category: 'dependencies',
    status: 'passed',
    duration: 450,
    lastRun: new Date(Date.now() - 15 * 60 * 1000),
    enabled: true,
  },
  {
    id: 'rust-toolchain',
    name: 'Rust Toolchain',
    description: 'Check Rust compiler and cargo versions',
    category: 'dependencies',
    status: 'passed',
    duration: 320,
    lastRun: new Date(Date.now() - 15 * 60 * 1000),
    enabled: true,
  },
  {
    id: 'contract-size',
    name: 'Contract Size Limits',
    description: 'Ensure contract binaries are within size limits',
    category: 'contract',
    status: 'failed',
    duration: 780,
    lastRun: new Date(Date.now() - 15 * 60 * 1000),
    errorMessage: 'crashlab-core.wasm exceeds 64KB limit (actual: 68KB)',
    enabled: true,
  },
  {
    id: 'env-variables',
    name: 'Environment Variables',
    description: 'Validate required environment variables are set',
    category: 'configuration',
    status: 'passed',
    duration: 120,
    lastRun: new Date(Date.now() - 15 * 60 * 1000),
    enabled: true,
  },
  {
    id: 'storage-backend',
    name: 'Storage Backend',
    description: 'Verify artifact storage is accessible',
    category: 'environment',
    status: 'passed',
    duration: 1450,
    lastRun: new Date(Date.now() - 15 * 60 * 1000),
    enabled: true,
  },
];

const MOCK_PIPELINE_RUNS: PipelineRun[] = [
  {
    id: 'run-1',
    startedAt: new Date(Date.now() - 15 * 60 * 1000),
    finishedAt: new Date(Date.now() - 10 * 60 * 1000),
    status: 'failed',
    totalChecks: 8,
    passedChecks: 6,
    failedChecks: 1,
    warningChecks: 1,
  },
  {
    id: 'run-2',
    startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    finishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000 + 5 * 60 * 1000),
    status: 'passed',
    totalChecks: 8,
    passedChecks: 8,
    failedChecks: 0,
    warningChecks: 0,
  },
  {
    id: 'run-3',
    startedAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
    finishedAt: new Date(Date.now() - 6 * 60 * 60 * 1000 + 5 * 60 * 1000),
    status: 'warning',
    totalChecks: 8,
    passedChecks: 7,
    failedChecks: 0,
    warningChecks: 1,
  },
];

export default function SanityCheckPipelinePage({ className = '' }: SanityCheckPipelinePageProps) {
<<<<<<< HEAD
  const [checks, setChecks] = useState<SanityCheck[]>([]);
  const [pipelineRuns, setPipelineRuns] = useState<PipelineRun[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchPipelineData = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 800));
        if (isMounted) {
          setChecks(MOCK_SANITY_CHECKS);
          setPipelineRuns(MOCK_PIPELINE_RUNS);
          setIsLoading(false);
        }
      } catch {
        if (isMounted) {
          setError('Failed to load sanity check pipeline data.');
          setIsLoading(false);
        }
      }
    };
    fetchPipelineData();
    return () => { isMounted = false; };
  }, []);

  const toggleCheck = useCallback((id: string) => {
    setChecks(prev => toggleSanityCheck(prev, id));
  }, []);

  const runPipeline = useCallback(async () => {
    setIsRunning(true);
    setError(null);
    try {
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          if (Math.random() < 0.05) reject(new Error('Network error'));
          else resolve(null);
        }, 2000);
      });
      
      const now = new Date();
      const startedAt = new Date(now.getTime() - 2000);
      const newRun = createNewPipelineRun(checks, `run-${Date.now()}`, startedAt, now);
      
      setPipelineRuns(prev => [newRun, ...prev].slice(0, 10));
      
    } catch {
      setError('Failed to run the pipeline. Please try again.');
    } finally {
      setIsRunning(false);
    }
  }, [checks]);
=======
  const [checks, setChecks] = useState<SanityCheck[]>(MOCK_SANITY_CHECKS);
  const [pipelineRuns, setPipelineRuns] = useState<PipelineRun[]>(MOCK_PIPELINE_RUNS);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isRunning, setIsRunning] = useState(false);

  const toggleCheck = useCallback((id: string) => {
    setChecks(prev =>
      prev.map(check =>
        check.id === id ? { ...check, enabled: !check.enabled } : check
      )
    );
  }, []);

  const runPipeline = useCallback(() => {
    setIsRunning(true);
    console.log('Running sanity check pipeline...');
    setTimeout(() => {
      setIsRunning(false);
    }, 3000);
  }, []);
>>>>>>> 7f26f98 (feat:implement Create Sanity check pipeline page page)

  const filteredChecks = checks.filter(check =>
    selectedCategory === 'all' || check.category === selectedCategory
  );

  const getStatusColor = (status: PipelineStatus) => {
    switch (status) {
      case 'passed': return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30';
      case 'failed': return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30';
      case 'warning': return 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30';
      case 'running': return 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30';
      default: return 'text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800';
    }
  };

  const getCategoryIcon = (category: CheckCategory) => {
    switch (category) {
      case 'contract': return '📦';
      case 'environment': return '🌐';
      case 'dependencies': return '🔧';
      case 'configuration': return '⚙️';
      default: return '✓';
    }
  };

  const getStatusIcon = (status: PipelineStatus) => {
    switch (status) {
      case 'passed': return '✓';
      case 'failed': return '✗';
      case 'warning': return '⚠';
      case 'running': return '⟳';
      default: return '○';
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

<<<<<<< HEAD
  if (isLoading) {
    return (
      <div className={`w-full ${className}`}>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm animate-pulse">
          <div className="p-8 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
            <div className="h-8 w-8 rounded-lg bg-zinc-200 dark:bg-zinc-700 mb-2"></div>
            <div className="h-6 w-48 bg-zinc-200 dark:bg-zinc-700 rounded mb-2"></div>
            <div className="h-4 w-96 bg-zinc-200 dark:bg-zinc-700 rounded"></div>
          </div>
          <div className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-zinc-100 dark:bg-zinc-800 h-24 rounded-xl"></div>
              ))}
            </div>
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-24 bg-zinc-100 dark:bg-zinc-800 rounded-xl"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentRun = pipelineRuns[0];
  const passRate = currentRun && currentRun.totalChecks > 0 ? Math.round((currentRun.passedChecks / currentRun.totalChecks) * 100) : 0;
=======
  const currentRun = pipelineRuns[0];
  const passRate = currentRun ? Math.round((currentRun.passedChecks / currentRun.totalChecks) * 100) : 0;
>>>>>>> 7f26f98 (feat:implement Create Sanity check pipeline page page)

  return (
    <div className={`w-full ${className}`}>
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
        {/* Header */}
        <div className="p-8 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-600 dark:bg-emerald-500 flex items-center justify-center text-white">
<<<<<<< HEAD
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
=======
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
>>>>>>> 7f26f98 (feat:implement Create Sanity check pipeline page page)
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Sanity Check Pipeline</h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Automated validation of contracts, environment, and dependencies
                </p>
              </div>
            </div>
            
            <button
              onClick={runPipeline}
<<<<<<< HEAD
              disabled={isRunning || checks.filter(c => c.enabled).length === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                (isRunning || checks.filter(c => c.enabled).length === 0)
=======
              disabled={isRunning}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                isRunning
>>>>>>> 7f26f98 (feat:implement Create Sanity check pipeline page page)
                  ? 'bg-zinc-300 dark:bg-zinc-700 text-zinc-500 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
<<<<<<< HEAD
              <svg className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
=======
              <svg className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
>>>>>>> 7f26f98 (feat:implement Create Sanity check pipeline page page)
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {isRunning ? 'Running...' : 'Run Pipeline'}
            </button>
          </div>
        </div>

<<<<<<< HEAD
        {error && (
          <div className="mx-8 mt-8 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 rounded-lg text-red-700 dark:text-red-400 text-sm font-medium flex items-center gap-2" role="alert">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        {/* Pipeline Status Summary */}
        {currentRun ? (
          <div className="p-8 border-b border-zinc-200 dark:border-zinc-800">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4">
                <div className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">Last Run</div>
                <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                  {formatTimestamp(currentRun.startedAt)}
                </div>
                <div className={`inline-flex items-center gap-1 mt-2 px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(currentRun.status)}`}>
                  {getStatusIcon(currentRun.status)} {currentRun.status.toUpperCase()}
                </div>
              </div>
              
              <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4">
                <div className="text-sm text-green-600 dark:text-green-400 mb-1">Passed</div>
                <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                  {currentRun.passedChecks}/{currentRun.totalChecks}
                </div>
                <div className="text-xs text-green-600 dark:text-green-400 mt-2">
                  {passRate}% success rate
                </div>
              </div>
              
              <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4">
                <div className="text-sm text-red-600 dark:text-red-400 mb-1">Failed</div>
                <div className="text-2xl font-bold text-red-700 dark:text-red-300">
                  {currentRun.failedChecks}
                </div>
                <div className="text-xs text-red-600 dark:text-red-400 mt-2">
                  {currentRun.failedChecks > 0 ? 'Requires attention' : 'No failures'}
                </div>
              </div>
              
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4">
                <div className="text-sm text-amber-600 dark:text-amber-400 mb-1">Warnings</div>
                <div className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                  {currentRun.warningChecks}
                </div>
                <div className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                  {currentRun.warningChecks > 0 ? 'Review recommended' : 'All clear'}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 border-b border-zinc-200 dark:border-zinc-800">
            <p className="text-sm text-zinc-500">No pipeline runs available.</p>
          </div>
        )}
=======
        {/* Pipeline Status Summary */}
        <div className="p-8 border-b border-zinc-200 dark:border-zinc-800">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4">
              <div className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">Last Run</div>
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {formatTimestamp(currentRun.startedAt)}
              </div>
              <div className={`inline-flex items-center gap-1 mt-2 px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(currentRun.status)}`}>
                {getStatusIcon(currentRun.status)} {currentRun.status.toUpperCase()}
              </div>
            </div>
            
            <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4">
              <div className="text-sm text-green-600 dark:text-green-400 mb-1">Passed</div>
              <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                {currentRun.passedChecks}/{currentRun.totalChecks}
              </div>
              <div className="text-xs text-green-600 dark:text-green-400 mt-2">
                {passRate}% success rate
              </div>
            </div>
            
            <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4">
              <div className="text-sm text-red-600 dark:text-red-400 mb-1">Failed</div>
              <div className="text-2xl font-bold text-red-700 dark:text-red-300">
                {currentRun.failedChecks}
              </div>
              <div className="text-xs text-red-600 dark:text-red-400 mt-2">
                {currentRun.failedChecks > 0 ? 'Requires attention' : 'No failures'}
              </div>
            </div>
            
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4">
              <div className="text-sm text-amber-600 dark:text-amber-400 mb-1">Warnings</div>
              <div className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                {currentRun.warningChecks}
              </div>
              <div className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                {currentRun.warningChecks > 0 ? 'Review recommended' : 'All clear'}
              </div>
            </div>
          </div>
        </div>
>>>>>>> 7f26f98 (feat:implement Create Sanity check pipeline page page)

        {/* Filters */}
        <div className="px-8 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-900/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
<<<<<<< HEAD
              <label htmlFor="category-select" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Category:
              </label>
              <select
                id="category-select"
=======
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Category:
              </label>
              <select
>>>>>>> 7f26f98 (feat:implement Create Sanity check pipeline page page)
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-1.5 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">All Categories</option>
                <option value="contract">Contract</option>
                <option value="environment">Environment</option>
                <option value="dependencies">Dependencies</option>
                <option value="configuration">Configuration</option>
              </select>
            </div>
            
            <div className="text-sm text-zinc-500 dark:text-zinc-400">
              {filteredChecks.filter(c => c.enabled).length} of {filteredChecks.length} checks enabled
            </div>
          </div>
        </div>

        {/* Checks List */}
        <div className="p-8">
          <div className="space-y-4">
            {filteredChecks.map((check) => (
              <div
                key={check.id}
                className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-lg" aria-hidden="true">
                        {getCategoryIcon(check.category)}
                      </span>
                      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                        {check.name}
                      </h3>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(check.status)}`}>
                        {getStatusIcon(check.status)} {check.status.toUpperCase()}
                      </span>
                    </div>
                    
                    <p className="text-zinc-600 dark:text-zinc-400 mb-3">
                      {check.description}
                    </p>
                    
                    {check.errorMessage && (
                      <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <div className="flex items-start gap-2">
<<<<<<< HEAD
                          <span className="text-red-600 dark:text-red-400" aria-hidden="true">✗</span>
=======
                          <span className="text-red-600 dark:text-red-400">✗</span>
>>>>>>> 7f26f98 (feat:implement Create Sanity check pipeline page page)
                          <span className="text-sm text-red-700 dark:text-red-300">{check.errorMessage}</span>
                        </div>
                      </div>
                    )}
                    
                    {check.warningMessage && (
                      <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                        <div className="flex items-start gap-2">
<<<<<<< HEAD
                          <span className="text-amber-600 dark:text-amber-400" aria-hidden="true">⚠</span>
=======
                          <span className="text-amber-600 dark:text-amber-400">⚠</span>
>>>>>>> 7f26f98 (feat:implement Create Sanity check pipeline page page)
                          <span className="text-sm text-amber-700 dark:text-amber-300">{check.warningMessage}</span>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-6 text-sm text-zinc-500 dark:text-zinc-400">
                      <div>
                        <span className="font-medium">Duration:</span> {formatDuration(check.duration)}
                      </div>
                      <div>
                        <span className="font-medium">Category:</span> {check.category}
                      </div>
                      {check.lastRun && (
                        <div>
                          <span className="font-medium">Last run:</span> {formatTimestamp(check.lastRun)}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <button
<<<<<<< HEAD
=======
                      onClick={() => console.log('View details:', check.id)}
                      className="p-2 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                      title="View details"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                    
                    <button
>>>>>>> 7f26f98 (feat:implement Create Sanity check pipeline page page)
                      onClick={() => toggleCheck(check.id)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900 ${
                        check.enabled ? 'bg-emerald-600' : 'bg-zinc-200 dark:bg-zinc-700'
                      }`}
                      aria-pressed={check.enabled}
<<<<<<< HEAD
                      aria-label={`Toggle ${check.name} check`}
=======
>>>>>>> 7f26f98 (feat:implement Create Sanity check pipeline page page)
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          check.enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Runs */}
        <div className="px-8 py-6 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-900/20">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Recent Pipeline Runs</h2>
          <div className="space-y-3">
            {pipelineRuns.map((run) => (
              <div
                key={run.id}
<<<<<<< HEAD
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg gap-4 sm:gap-0"
=======
                className="flex items-center justify-between p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg"
>>>>>>> 7f26f98 (feat:implement Create Sanity check pipeline page page)
              >
                <div className="flex items-center gap-4">
                  <span className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(run.status)}`}>
                    {getStatusIcon(run.status)} {run.status.toUpperCase()}
                  </span>
                  <div className="text-sm">
                    <span className="text-zinc-500 dark:text-zinc-400">Started:</span>{' '}
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {run.startedAt.toLocaleString()}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-green-600 dark:text-green-400">
<<<<<<< HEAD
                    <span aria-hidden="true">✓</span> {run.passedChecks} passed
                  </div>
                  {run.failedChecks > 0 && (
                    <div className="text-red-600 dark:text-red-400">
                      <span aria-hidden="true">✗</span> {run.failedChecks} failed
=======
                    ✓ {run.passedChecks} passed
                  </div>
                  {run.failedChecks > 0 && (
                    <div className="text-red-600 dark:text-red-400">
                      ✗ {run.failedChecks} failed
>>>>>>> 7f26f98 (feat:implement Create Sanity check pipeline page page)
                    </div>
                  )}
                  {run.warningChecks > 0 && (
                    <div className="text-amber-600 dark:text-amber-400">
<<<<<<< HEAD
                      <span aria-hidden="true">⚠</span> {run.warningChecks} warnings
=======
                      ⚠ {run.warningChecks} warnings
>>>>>>> 7f26f98 (feat:implement Create Sanity check pipeline page page)
                    </div>
                  )}
                </div>
              </div>
            ))}
<<<<<<< HEAD
            {pipelineRuns.length === 0 && (
              <p className="text-sm text-zinc-500">No recent runs available.</p>
            )}
=======
>>>>>>> 7f26f98 (feat:implement Create Sanity check pipeline page page)
          </div>
        </div>
      </div>
    </div>
  );
}
