'use client';

import React, { useState } from 'react';
import { useMockScenarios } from './hooks/useMockScenarios';
import { EndpointRuleEditor } from './editors/EndpointRuleEditor';
import { StreamScenarioEditor } from './editors/StreamScenarioEditor';
import { FaultInjectionPanel } from './editors/FaultInjectionPanel';
import { TrafficRecorder } from './recorder/TrafficRecorder';
import { ContractValidator } from './validator/ContractValidator';

export function ScenarioWorkbench() {
  const {
    scenarios,
    activeScenario,
    activeScenarioId,
    setActiveScenarioId,
    mockModeEnabled,
    toggleMockMode,
    runtimeAllowed,
    conflicts,
    updateRule,
    switchProfile,
  } = useMockScenarios();

  const [selectedRuleId, setSelectedRuleId] = useState<string>(
    activeScenario?.rules[0]?.id ?? '',
  );

  const selectedRule =
    activeScenario?.rules.find((r) => r.id === selectedRuleId) ?? activeScenario?.rules[0];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 text-zinc-100">
      {mockModeEnabled && (
        <div
          role="status"
          className="flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200"
        >
          <span>
            <strong>MOCK MODE ACTIVE:</strong> Requests are intercepted by{' '}
            <code>{activeScenario.name}</code> (v{activeScenario.version}).
          </span>
          <button
            type="button"
            onClick={toggleMockMode}
            className="rounded bg-amber-600 px-2.5 py-1 font-medium text-white hover:bg-amber-500"
          >
            Disable Mock Mode
          </button>
        </div>
      )}

      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-bold">API & Scenario Mocking Workbench</h1>
          <p className="text-sm text-zinc-400">
            Deterministic REST, SSE, and Soroban RPC simulation for dev, e2e, demos, and bug reproduction.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(['dev', 'e2e', 'demo', 'bug-repro'] as const).map((profile) => (
            <button
              key={profile}
              type="button"
              onClick={() => switchProfile(profile)}
              className={`rounded px-2.5 py-1 text-xs font-medium capitalize ${
                activeScenario.profile === profile
                  ? 'bg-indigo-600 text-white'
                  : 'border border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              {profile}
            </button>
          ))}

          <button
            type="button"
            disabled={!runtimeAllowed}
            onClick={toggleMockMode}
            className={`ml-2 rounded px-3 py-1.5 text-xs font-semibold ${
              !runtimeAllowed
                ? 'cursor-not-allowed bg-zinc-800 text-zinc-500'
                : mockModeEnabled
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200'
            }`}
          >
            {!runtimeAllowed
              ? 'Blocked in Prod'
              : mockModeEnabled
                ? 'Mock Mode: ON'
                : 'Mock Mode: OFF'}
          </button>
        </div>
      </header>

      {conflicts.length > 0 && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
          <strong>Rule Conflicts Detected:</strong>{' '}
          {conflicts.map((c) => `${c.ruleA} vs ${c.ruleB} (${c.reason})`).join('; ')}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <aside className="space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Scenario Pack
          </label>
          <select
            value={activeScenarioId}
            onChange={(e) => setActiveScenarioId(e.target.value)}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} (v{s.version})
              </option>
            ))}
          </select>

          <div className="space-y-1.5 pt-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Rules ({activeScenario.rules.length})
            </div>
            {activeScenario.rules.map((rule) => (
              <button
                key={rule.id}
                type="button"
                onClick={() => setSelectedRuleId(rule.id)}
                className={`w-full rounded border px-3 py-2 text-left text-xs ${
                  selectedRule?.id === rule.id
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-200'
                    : 'border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:bg-zinc-900'
                }`}
              >
                <div className="font-medium">{rule.name}</div>
                <div className="font-mono text-[11px] text-zinc-400">
                  {rule.matcher.protocol.toUpperCase()} {rule.matcher.pathPattern}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <main className="space-y-4 lg:col-span-3">
          {selectedRule && (
            <>
              <EndpointRuleEditor
                rule={selectedRule}
                onChange={(updated) => updateRule(selectedRule.id, () => updated)}
              />
              {selectedRule.matcher.protocol === 'sse' && (
                <StreamScenarioEditor
                  steps={selectedRule.streamSteps ?? []}
                  onChange={(streamSteps) =>
                    updateRule(selectedRule.id, (r) => ({ ...r, streamSteps }))
                  }
                />
              )}
              <FaultInjectionPanel
                fault={selectedRule.fault}
                onChange={(fault) => updateRule(selectedRule.id, (r) => ({ ...r, fault }))}
              />
            </>
          )}
          <ContractValidator rules={activeScenario.rules} />
          <TrafficRecorder />
        </main>
      </div>
    </div>
  );
}
