'use client';

import { useState } from 'react';
import { InvocationScenario } from '@/lib/invocations/schema';

export default function SimulationPreview({ scenario, onExport }: { scenario: InvocationScenario; onExport: (format: 'json' | 'fixture' | 'api') => void }) {
  const [result, setResult] = useState<{ errors: string[]; warnings: string[]; steps: Array<{ step: number; authRequired: boolean; resourceEstimate: number }> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const simulate = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/invocations/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(scenario) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Preflight failed.');
      setResult(data.data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Preflight unavailable.'); }
    finally { setBusy(false); }
  };
  return <section className="card card-padding space-y-4" aria-labelledby="preview-heading">
    <div><h2 id="preview-heading" className="text-lg font-semibold">4. Preflight & export</h2><p className="text-sm text-meta">Static schema and scenario checks only. This preview does not contact Stellar or execute a simulation.</p></div>
    <div className="flex flex-wrap gap-2"><button type="button" className="btn-primary px-4 py-2 text-sm" onClick={simulate} disabled={busy}>{busy ? 'Checking…' : 'Validate scenario'}</button>{(['json', 'fixture', 'api'] as const).map((format) => <button key={format} type="button" className="btn-outline px-3 py-2 text-sm" onClick={() => onExport(format)}>Export {format.toUpperCase()}</button>)}</div>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    {result && <div aria-live="polite" className="space-y-2"><h3 className="font-medium">{result.errors.length ? `${result.errors.length} issue(s) to fix` : 'Preflight passed'}</h3>{result.errors.map((item) => <p key={item} className="text-sm text-red-400">{item}</p>)}{result.warnings.map((item) => <p key={item} className="text-sm text-amber-400">{item}</p>)}{result.steps.map((step) => <p key={step.step} className="text-sm text-meta">Step {step.step}: estimated {step.resourceEstimate.toLocaleString()} instructions · {step.authRequired ? 'authorization likely required' : 'read-only call'}</p>)}</div>}
  </section>;
}
