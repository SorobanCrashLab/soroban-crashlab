'use client';

import { ChangeEvent } from 'react';
import { ContractSpec, SAMPLE_CONTRACT, isContractSpec } from '@/lib/invocations/schema';

export default function ContractSelector({ spec, onChange, error }: { spec: ContractSpec; onChange: (spec: ContractSpec) => void; error?: string | null }) {
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isContractSpec(parsed)) throw new Error('Spec must include contractId, name, network, and functions with typed args.');
      onChange(parsed);
    } catch (reason) {
      onChange({ ...SAMPLE_CONTRACT, name: reason instanceof Error ? `Upload error: ${reason.message}` : 'Upload error' });
    }
    event.target.value = '';
  };

  return <section className="card card-padding space-y-4" aria-labelledby="contract-heading">
    <div><h2 id="contract-heading" className="text-lg font-semibold">1. Contract interface</h2><p className="text-sm text-meta">Load the demo ABI-like spec or upload a JSON contract interface. WASM-to-Soroban-spec decoding is not available in this preview.</p></div>
    <div className="grid gap-3 md:grid-cols-2">
      <label className="text-sm">Contract
        <select className="input-field mt-1" value={spec.contractId} onChange={() => onChange(SAMPLE_CONTRACT)} aria-label="Contract interface">
          <option value={SAMPLE_CONTRACT.contractId}>{SAMPLE_CONTRACT.name} · {SAMPLE_CONTRACT.network}</option>
        </select>
      </label>
      <label className="text-sm">Upload JSON interface<input className="input-field mt-1" type="file" accept="application/json,.json" onChange={upload} aria-describedby="spec-upload-help" /></label>
    </div>
    <p id="spec-upload-help" className="text-xs text-meta">The file must follow the ContractSpec format. Uploaded specs stay in this browser session.</p>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    <div className="flex flex-wrap gap-2 text-xs"><span className="rounded bg-slate-800 px-2 py-1">{spec.contractId}</span><span className="rounded bg-slate-800 px-2 py-1">{spec.functions.length} functions</span></div>
  </section>;
}
