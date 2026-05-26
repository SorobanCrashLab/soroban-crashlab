"use client";

import React, { useState, useCallback, useEffect } from 'react';
import {
  SanityCheck,
  PipelineRun,
  toggleSanityCheck,
  createNewPipelineRun,
} from './sanity-check-utils';

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
        await new Promise(resolve => setTimeout(resolve, 300));
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

  const runPipeline = useCallback(() => {
    setIsRunning(true);
    setTimeout(() => {
      const run = createNewPipelineRun(checks, `run-${Date.now()}`, new Date(), new Date());
      setPipelineRuns(prev => [run, ...prev]);
      setIsRunning(false);
    }, 500);
  }, [checks]);

  return (
    <div className={className}>
      <h1 className="text-2xl font-bold mb-4">Sanity Check Pipeline</h1>
      {error && <div className="text-red-600">{error}</div>}
      <div className="mb-4 flex gap-2 items-center">
        <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
          <option value="all">All</option>
          <option value="contract">Contract</option>
          <option value="environment">Environment</option>
          <option value="dependencies">Dependencies</option>
          <option value="configuration">Configuration</option>
        </select>
        <button onClick={runPipeline} disabled={isRunning} className="px-3 py-1 bg-blue-600 text-white rounded">
          {isRunning ? 'Running…' : 'Run Pipeline'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h2 className="font-semibold mb-2">Checks</h2>
          {isLoading ? (
            <div>Loading...</div>
          ) : (
            <ul className="space-y-2">
              {checks.filter(c => selectedCategory === 'all' || c.category === selectedCategory).map(check => (
                <li key={check.id} className="flex items-center justify-between p-2 border rounded">
                  <div>
                    <div className="font-medium">{check.name}</div>
                    <div className="text-sm text-gray-500">{check.description}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleCheck(check.id)} className="px-2 py-1 border rounded">{check.enabled ? 'Enabled' : 'Disabled'}</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className="font-semibold mb-2">Pipeline Runs</h2>
          <ul className="space-y-2">
            {pipelineRuns.map(run => (
              <li key={run.id} className="p-2 border rounded">
                <div className="flex justify-between">
                  <div className="font-medium">{run.id}</div>
                  <div className="text-sm text-gray-500">{new Date(run.startedAt).toLocaleString()}</div>
                </div>
                <div className="text-sm">Status: {run.status}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
