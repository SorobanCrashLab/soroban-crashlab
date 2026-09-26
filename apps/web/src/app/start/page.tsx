'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { api } from '../../lib/api-client';
import { createIdempotencyKeyTracker } from '../../lib/idempotency-key';
import {
  parseContractWasmFile,
  proposeFuzzTargets,
  type FuzzTargetDescriptor,
  type ParsedContract,
} from '@/lib/wasm-parse';
import type { CampaignAuthMode, CampaignSeedSource } from '../types';

const STEPS = ['Upload contract', 'Pick targets', 'Launch'];

type Phase = 'upload' | 'targets' | 'launch' | 'done';

export default function StartPage() {
  const [phase, setPhase] = useState<Phase>('upload');
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedContract | null>(null);
  const [targets, setTargets] = useState<FuzzTargetDescriptor[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [seedSource, setSeedSource] = useState<CampaignSeedSource>('random');
  const [authMode, setAuthMode] = useState<CampaignAuthMode>('none');
  const [parallelism, setParallelism] = useState(4);
  const [timeoutSeconds, setTimeoutSeconds] = useState(3600);
  const [parsing, setParsing] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  // Relaunching the same config after a failure reuses its key (#1634).
  const idempotencyKeys = useRef(createIdempotencyKeyTracker());

  const stepIndex = phase === 'upload' ? 0 : phase === 'targets' ? 1 : 2;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setParsing(true);
    try {
      const contract = await parseContractWasmFile(file);
      const proposed = proposeFuzzTargets(contract);
      setParsed(contract);
      setTargets(proposed);
      setSelected(new Set(proposed.map((t) => t.method)));
      setFileName(file.name);
      setPhase('targets');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that WASM file.');
    } finally {
      setParsing(false);
    }
  }

  function toggleTarget(method: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(method)) {
        next.delete(method);
      } else {
        next.add(method);
      }
      return next;
    });
  }

  async function handleLaunch() {
    if (selected.size === 0) {
      setError('Pick at least one target to fuzz.');
      return;
    }
    setError(null);
    setLaunching(true);
    try {
      const config = { seedSource, authMode, parallelism, timeoutSeconds };
      const result = await api.campaigns.create(config, undefined, idempotencyKeys.current.keyFor(config));
      idempotencyKeys.current.reset();
      const campaign = result.campaign as { id?: string };
      setCampaignId(typeof campaign.id === 'string' ? campaign.id : 'campaign');
      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not launch the campaign.');
    } finally {
      setLaunching(false);
    }
  }

  function reset() {
    setPhase('upload');
    setParsed(null);
    setTargets([]);
    setSelected(new Set());
    setFileName('');
    setError(null);
    setCampaignId(null);
  }

  return (
    <div className="container-full page-padding fade-in">
      <PageHeader
        title="Start a fuzzing run"
        description="Upload a contract, pick what to break, launch. Three steps, about two minutes."
        breadcrumbs={
          <nav className="breadcrumb-nav" aria-label="Breadcrumb">
            <ol className="breadcrumb-list">
              <li className="breadcrumb-item">
                <Link href="/dashboard" className="breadcrumb-link">Dashboard</Link>
              </li>
              <li className="breadcrumb-item" aria-hidden="true">
                <span className="breadcrumb-separator">/</span>
              </li>
              <li className="breadcrumb-item">
                <span className="breadcrumb-current" aria-current="page">Start</span>
              </li>
            </ol>
          </nav>
        }
      />

      <ol className="flex items-center gap-2 sm:gap-4 mb-6" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2 sm:gap-4">
            <span
              className={`code-text px-2 py-1 border ${
                i <= stepIndex ? 'font-bold' : ''
              }`}
              style={
                i <= stepIndex
                  ? { borderColor: 'var(--text-primary)', color: 'var(--text-primary)' }
                  : { borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }
              }
            >
              {i + 1}
            </span>
            <span className="text-sm-medium" style={{ color: i <= stepIndex ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
              {label}
            </span>
            {i < STEPS.length - 1 && <span aria-hidden="true" style={{ color: 'var(--border-color)' }}>—</span>}
          </li>
        ))}
      </ol>

      {error && (
        <div role="alert" className="card card-padding mb-4 text-sm" style={{ borderLeft: '4px solid var(--text-primary)' }}>
          {error}
        </div>
      )}

      {phase === 'upload' && (
        <div className="card card-padding">
          <h2 className="heading-section">Step 1 — Upload your contract</h2>
          <p className="text-meta mt-1 mb-4">
            Drop in the compiled <span className="code-text">.wasm</span> file for your Soroban contract.
            CrashLab reads its exported functions and proposes fuzz targets on the next step.
          </p>
          <label className="input-label" htmlFor="start-wasm-file">Contract WASM file</label>
          <input
            id="start-wasm-file"
            type="file"
            accept=".wasm"
            disabled={parsing}
            onChange={(e) => void handleFile(e.target.files?.[0])}
            className="input-field"
          />
          <p className="text-meta mt-2">Maximum size: 16MB. Only .wasm files are accepted.</p>
          {parsing && <p className="text-meta mt-2">Reading contract…</p>}
        </div>
      )}

      {phase === 'targets' && parsed && (
        <div className="card card-padding">
          <h2 className="heading-section">Step 2 — Pick what to break</h2>
          <p className="text-meta mt-1 mb-4">
            <span className="code-text">{fileName}</span> exports {targets.length} callable{' '}
            {targets.length === 1 ? 'function' : 'functions'}. Tick the ones the fuzzer should hammer.
          </p>
          {targets.length === 0 ? (
            <p className="text-meta">No exported functions found in this contract.</p>
          ) : (
            <ul className="space-y-2 mb-4">
              {targets.map((t) => (
                <li key={t.method}>
                  <label className="flex items-center gap-3 card card-padding cursor-pointer">
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={selected.has(t.method)}
                      onChange={() => toggleTarget(t.method)}
                    />
                    <span className="code-text">{t.method}</span>
                    <span className="chip text-xs ml-auto">
                      {t.argTemplates.length} {t.argTemplates.length === 1 ? 'arg' : 'args'}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-3">
            <button type="button" className="btn-ghost text-xs sm:text-sm" onClick={reset}>
              Start over
            </button>
            <button
              type="button"
              className="btn-primary text-xs sm:text-sm"
              disabled={targets.length === 0}
              onClick={() => setPhase('launch')}
            >
              Continue with {selected.size} {selected.size === 1 ? 'target' : 'targets'}
            </button>
          </div>
        </div>
      )}

      {phase === 'launch' && (
        <div className="card card-padding">
          <h2 className="heading-section">Step 3 — Launch the campaign</h2>
          <p className="text-meta mt-1 mb-4">
            Fuzzing <strong style={{ color: 'var(--text-primary)' }}>{selected.size}</strong>{' '}
            {selected.size === 1 ? 'target' : 'targets'} from <span className="code-text">{fileName}</span>.
            Results land on the Runs page as crashes stream in.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="input-label" htmlFor="start-seed">Seed source</label>
              <select
                id="start-seed"
                className="input-field"
                value={seedSource}
                onChange={(e) => setSeedSource(e.target.value as CampaignSeedSource)}
              >
                <option value="random">Random mutation</option>
                <option value="corpus">Existing corpus</option>
                <option value="replay">Specific replay</option>
              </select>
            </div>
            <div>
              <label className="input-label" htmlFor="start-auth">Auth mode</label>
              <select
                id="start-auth"
                className="input-field"
                value={authMode}
                onChange={(e) => setAuthMode(e.target.value as CampaignAuthMode)}
              >
                <option value="none">None (public)</option>
                <option value="mock">Mock ledger auth</option>
                <option value="keypair">Signed keypair</option>
              </select>
            </div>
            <div>
              <label className="input-label" htmlFor="start-parallelism">Parallel workers (1–32)</label>
              <input
                id="start-parallelism"
                type="number"
                min={1}
                max={32}
                className="input-field"
                value={parallelism}
                onChange={(e) => setParallelism(Number(e.target.value) || 1)}
              />
            </div>
            <div>
              <label className="input-label" htmlFor="start-timeout">Timeout (seconds)</label>
              <input
                id="start-timeout"
                type="number"
                min={60}
                className="input-field"
                value={timeoutSeconds}
                onChange={(e) => setTimeoutSeconds(Number(e.target.value) || 60)}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" className="btn-ghost text-xs sm:text-sm" onClick={() => setPhase('targets')}>
              Back
            </button>
            <button
              type="button"
              className="btn-primary text-xs sm:text-sm"
              disabled={launching}
              onClick={() => void handleLaunch()}
            >
              {launching ? 'Launching…' : 'Launch campaign'}
            </button>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="card card-padding text-center">
          <p className="text-meta uppercase mb-2">Campaign queued</p>
          <h2 className="heading-section mb-2">Your fuzzer is off to work</h2>
          {campaignId && <p className="code-text mb-4">{campaignId}</p>}
          <p className="text-meta mb-6">
            Watch it live on Runs, then triage whatever breaks on the Triage board.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link href="/runs" prefetch className="btn-primary text-xs sm:text-sm">
              Watch runs
            </Link>
            <Link href="/triage" prefetch className="btn-outline text-xs sm:text-sm">
              Open triage
            </Link>
            <button type="button" className="btn-ghost text-xs sm:text-sm" onClick={reset}>
              Start another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
