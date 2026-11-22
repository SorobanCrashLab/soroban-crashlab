'use client';

import { useState } from 'react';
import { InvocationScenario } from '@/lib/invocations/schema';

const KEY = 'crashlab-invocation-scenarios-v1';
type SavedTemplate = { id: string; savedAt: string; version: number; scenario: InvocationScenario };
function readTemplates(): SavedTemplate[] { try { const value: unknown = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(value) ? value as SavedTemplate[] : []; } catch { return []; } }
export default function ScenarioTemplates({ scenario, onLoad }: { scenario: InvocationScenario; onLoad: (scenario: InvocationScenario) => void }) {
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [message, setMessage] = useState('');
  const refresh = () => setTemplates(readTemplates());
  const save = () => { const list = readTemplates(); const id = `${scenario.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'scenario'}-${Date.now()}`; const next = [...list, { id, savedAt: new Date().toISOString(), version: list.filter((item) => item.scenario.name === scenario.name).length + 1, scenario }]; localStorage.setItem(KEY, JSON.stringify(next)); setTemplates(next); setMessage(`Saved version ${next[next.length - 1].version} in this browser.`); };
  return <section className="card card-padding space-y-3" aria-labelledby="templates-heading"><div className="flex flex-wrap justify-between gap-2"><div><h2 id="templates-heading" className="text-lg font-semibold">2. Scenario templates</h2><p className="text-sm text-meta">Save versioned drafts locally in this browser. No cross-user sharing or server library yet.</p></div><div className="flex gap-2"><button type="button" className="btn-outline px-3 py-2 text-sm" onClick={refresh}>Load list</button><button type="button" className="btn-outline px-3 py-2 text-sm" onClick={save}>Save version</button></div></div>{message && <p role="status" className="text-sm text-emerald-400">{message}</p>}{templates.map((item) => <div key={item.id} className="flex items-center justify-between border-t border-slate-700 py-2 text-sm"><span>{item.scenario.name} · v{item.version} · {new Date(item.savedAt).toLocaleString()}</span><button type="button" className="text-blue-400" onClick={() => { onLoad(item.scenario); setMessage(`Loaded ${item.scenario.name} version ${item.version}.`); }}>Load</button></div>)}</section>;
}
