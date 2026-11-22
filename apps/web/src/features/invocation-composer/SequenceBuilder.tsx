'use client';

import FunctionCallEditor, { emptyValue } from './FunctionCallEditor';
import { ContractSpec, InvocationStep } from '@/lib/invocations/schema';

export default function SequenceBuilder({ specs, steps, onChange }: { specs: ContractSpec[]; steps: InvocationStep[]; onChange: (steps: InvocationStep[]) => void }) {
  const add = () => {
    const spec = specs[0]; const fn = spec.functions[0];
    onChange([...steps, { id: `step-${Date.now()}`, contractId: spec.contractId, functionName: fn.name, args: Object.fromEntries(fn.args.map((arg) => [arg.name, emptyValue(arg)])) }]);
  };
  const update = (index: number, patch: Partial<InvocationStep>) => onChange(steps.map((step, i) => i === index ? { ...step, ...patch } : step));
  const move = (index: number, direction: -1 | 1) => { const next = [...steps]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; onChange(next); };
  return <section className="card card-padding space-y-4" aria-labelledby="sequence-heading">
    <div className="flex items-center justify-between gap-3"><div><h2 id="sequence-heading" className="text-lg font-semibold">3. Invocation sequence</h2><p className="text-sm text-meta">Order calls, add an earlier-step dependency, and document an optional condition.</p></div><button type="button" className="btn-outline px-3 py-2 text-sm" onClick={add}>Add call</button></div>
    {!steps.length && <p className="text-sm text-meta">No calls yet. Add a call to compose a scenario.</p>}
    <ol className="space-y-3">{steps.map((step, index) => {
      const spec = specs.find((item) => item.contractId === step.contractId) || specs[0];
      const fn = spec.functions.find((item) => item.name === step.functionName) || spec.functions[0];
      return <li key={step.id} className="rounded-lg border border-slate-700 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">Step {index + 1}</span><select className="input-field max-w-xs" aria-label={`Function for step ${index + 1}`} value={fn.name} onChange={(event) => { const selected = spec.functions.find((item) => item.name === event.target.value)!; update(index, { functionName: selected.name, args: Object.fromEntries(selected.args.map((arg) => [arg.name, emptyValue(arg)])) }); }}>{spec.functions.map((item) => <option key={item.name} value={item.name}>{item.name} · {item.mutability || 'unknown'}</option>)}</select><button type="button" className="btn-outline px-2 py-1 text-xs" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move step ${index + 1} up`}>↑</button><button type="button" className="btn-outline px-2 py-1 text-xs" disabled={index === steps.length - 1} onClick={() => move(index, 1)} aria-label={`Move step ${index + 1} down`}>↓</button><button type="button" className="ml-auto text-sm text-red-400" onClick={() => onChange(steps.filter((_, i) => i !== index))} aria-label={`Remove step ${index + 1}`}>Remove</button></div>
        <FunctionCallEditor fn={fn} args={step.args} onChange={(args) => update(index, { args })} label={`Step ${index + 1}`} />
        <div className="grid gap-3 md:grid-cols-2"><label className="text-sm">Depends on<select className="input-field mt-1" value={step.dependsOn || ''} onChange={(event) => update(index, { dependsOn: event.target.value || undefined })}><option value="">No dependency</option>{steps.slice(0, index).map((prior, priorIndex) => <option key={prior.id} value={prior.id}>Step {priorIndex + 1}</option>)}</select></label><label className="text-sm">Condition (optional)<input className="input-field mt-1" value={step.condition || ''} placeholder="e.g. previous result is true" onChange={(event) => update(index, { condition: event.target.value || undefined })} /></label></div>
      </li>;
    })}</ol>
  </section>;
}
