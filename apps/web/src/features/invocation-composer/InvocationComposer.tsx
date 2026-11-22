'use client';

import { useState } from 'react';
import ContractSelector from './ContractSelector';
import SequenceBuilder from './SequenceBuilder';
import SimulationPreview from './SimulationPreview';
import ScenarioTemplates from './templates/ScenarioTemplates';
import { useInvocationComposer } from './hooks/useInvocationComposer';
import { exportScenario } from '@/lib/invocations/exporters';
import { validateScenario } from '@/lib/invocations/schema';

export default function InvocationComposer() {
  const composer = useInvocationComposer();
  const [specError, setSpecError] = useState<string | null>(null);
  const errors = validateScenario(composer.scenario, composer.specs);
  const exportFile = (format: 'json' | 'fixture' | 'api') => {
    const blob = new Blob([exportScenario(composer.scenario, format)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `scenario.${format === 'fixture' ? 'ts' : 'json'}`; link.click(); URL.revokeObjectURL(url);
  };
  return <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-8 md:px-8">
    <header className="space-y-2"><p className="text-xs uppercase tracking-widest text-blue-400">Invocation workbench</p><h1 className="text-3xl font-bold">Contract Call Builder</h1><p className="max-w-3xl text-sm text-meta">Compose schema-aware calls, arrange a scenario, check inputs, and export a deterministic fixture. The preview is local preflight, not a transaction simulator.</p></header>
    <ContractSelector spec={composer.spec} onChange={(spec) => { setSpecError(null); composer.setSpec(spec); }} error={specError} />
    <ScenarioTemplates scenario={composer.scenario} onLoad={composer.loadScenario} />
    <section className="card card-padding space-y-4" aria-labelledby="context-heading"><h2 id="context-heading" className="text-lg font-semibold">Scenario & execution context</h2><p className="text-sm text-meta">Safe defaults: testnet context and a bounded instruction budget. No signing keys are collected or stored.</p><div className="grid gap-3 md:grid-cols-2"><label className="text-sm">Scenario name<input className="input-field mt-1" value={composer.name} onChange={(event) => composer.setName(event.target.value)} /></label><label className="text-sm">Network<input className="input-field mt-1" value={composer.network} onChange={(event) => composer.setNetwork(event.target.value)} /></label><label className="text-sm">Invoker address (optional)<input className="input-field mt-1 font-mono" value={composer.invoker} onChange={(event) => composer.setInvoker(event.target.value)} placeholder="G…" /></label><label className="text-sm">Instruction budget<input className="input-field mt-1" type="number" min="1" max="100000000" value={composer.budget} onChange={(event) => composer.setBudget(Number(event.target.value))} /></label></div></section>
    <SequenceBuilder specs={composer.specs} steps={composer.steps} onChange={composer.setSteps} />
    {errors.length > 0 && <aside className="card card-padding" aria-label="Validation summary"><h2 className="font-semibold">Validation</h2><ul className="mt-2 list-disc pl-5 text-sm text-amber-400">{errors.map((error) => <li key={error}>{error}</li>)}</ul></aside>}
    <SimulationPreview scenario={composer.scenario} onExport={exportFile} />
  </main>;
}
