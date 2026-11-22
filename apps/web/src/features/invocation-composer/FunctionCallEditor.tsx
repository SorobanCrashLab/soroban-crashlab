'use client';

import { AbiArgument, ContractFunction } from '@/lib/invocations/schema';

export function emptyValue(arg: AbiArgument): unknown {
  switch (arg.type.kind) {
    case 'bool': return false;
    case 'vec': return [];
    case 'map':
    case 'struct': return {};
    default: return '';
  }
}

export default function FunctionCallEditor({ fn, args, onChange, label = 'Call' }: { fn: ContractFunction; args: Record<string, unknown>; onChange: (args: Record<string, unknown>) => void; label?: string }) {
  const setArg = (name: string, value: unknown) => onChange({ ...args, [name]: value });
  return <div className="space-y-3" aria-label={`${label} arguments`}>
    {fn.args.length === 0 && <p className="text-sm text-meta">This function takes no arguments.</p>}
    {fn.args.map((arg) => {
      const id = `${label.replace(/\s/g, '-')}-${arg.name}`;
      const complex = ['vec', 'map', 'struct'].includes(arg.type.kind);
      return <div key={arg.name}>
        <label className="block text-sm font-medium" htmlFor={id}>{arg.name} <span className="text-xs text-meta">({arg.type.kind})</span></label>
        {arg.type.kind === 'bool' ? <select id={id} className="input-field mt-1" value={String(args[arg.name] ?? false)} onChange={(event) => setArg(arg.name, event.target.value === 'true')}><option value="false">false</option><option value="true">true</option></select>
          : arg.type.kind === 'enum' ? <select id={id} className="input-field mt-1" value={String(args[arg.name] ?? '')} onChange={(event) => setArg(arg.name, event.target.value)}><option value="">Choose…</option>{arg.type.variants.map((variant) => <option key={variant}>{variant}</option>)}</select>
            : <textarea id={id} className="input-field mt-1 font-mono" rows={complex ? 3 : 1} inputMode={['u32', 'u64', 'i32', 'i64'].includes(arg.type.kind) ? 'numeric' : undefined} placeholder={complex ? 'JSON value' : arg.type.kind === 'bytes' ? 'Hex bytes (e.g. 00ff)' : `Enter ${arg.type.kind}`} value={complex ? (typeof args[arg.name] === 'string' ? args[arg.name] as string : JSON.stringify(args[arg.name] ?? emptyValue(arg), null, 2)) : String(args[arg.name] ?? '')} onChange={(event) => {
              if (!complex) { setArg(arg.name, ['u32', 'u64', 'i32', 'i64'].includes(arg.type.kind) && event.target.value !== '' ? Number(event.target.value) : event.target.value); return; }
              try { setArg(arg.name, JSON.parse(event.target.value)); } catch { setArg(arg.name, event.target.value); }
            }} aria-describedby={`${id}-hint`} />}
        <p id={`${id}-hint`} className="mt-1 text-xs text-meta">{arg.description || `Enter ${arg.type.kind} value${complex ? ' as JSON' : ''}.`}</p>
      </div>;
    })}
  </div>;
}
