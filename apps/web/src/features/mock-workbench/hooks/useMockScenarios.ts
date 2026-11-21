'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  detectRuleConflicts,
  isMockRuntimeAllowed,
  MockRule,
  MockScenario,
} from '@/lib/mocks/scenario-runtime';

const INITIAL_SCENARIOS: MockScenario[] = [
  {
    id: 'scn-degraded-rpc',
    name: 'Degraded Soroban RPC & Timeout',
    version: '1.2.0',
    profile: 'bug-repro',
    description: 'Simulates intermittent Soroban RPC 500s and 2.5s latency spikes during campaign replay.',
    updatedAt: '2026-11-21T09:30:00Z',
    rules: [
      {
        id: 'rule-rpc-sim',
        name: 'simulateTransaction Fault',
        enabled: true,
        matcher: { protocol: 'rpc', pathPattern: '/api/rpc', rpcMethod: 'simulateTransaction' },
        statusCode: 503,
        headers: { 'Content-Type': 'application/json' },
        responseBody: JSON.stringify({ error: 'RPC_UNAVAILABLE', retryAfterMs: 3000 }, null, 2),
        fault: { type: 'http_500', latencyMs: 2500, jitterMs: 250, failureRate: 0.5, statusCode: 503 },
      },
      {
        id: 'rule-sse-run',
        name: 'Campaign Progress SSE',
        enabled: true,
        matcher: { protocol: 'sse', pathPattern: '/api/runs/*/stream' },
        statusCode: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        responseBody: '',
        streamSteps: [
          { id: 'st-1', event: 'progress', data: '{"iteration":120,"crashes":1}', delayMs: 200 },
          { id: 'st-2', event: 'crash_found', data: '{"seed":"0xdeadbeef","panic":"overflow"}', delayMs: 600 },
        ],
        fault: { type: 'none', latencyMs: 100, jitterMs: 0, failureRate: 0 },
      },
    ],
  },
  {
    id: 'scn-e2e-happy',
    name: 'E2E Deterministic Baseline',
    version: '1.0.0',
    profile: 'e2e',
    description: 'Zero-latency deterministic responses for Playwright CI runs.',
    updatedAt: '2026-11-20T14:00:00Z',
    rules: [
      {
        id: 'rule-runs-list',
        name: 'GET /api/runs',
        enabled: true,
        matcher: { protocol: 'rest', method: 'GET', pathPattern: '/api/runs' },
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        responseBody: JSON.stringify({ runs: [{ id: 'run-001', status: 'completed', crashes: 0 }] }, null, 2),
        fault: { type: 'none', latencyMs: 0, jitterMs: 0, failureRate: 0 },
      },
    ],
  },
];

export function useMockScenarios() {
  const [scenarios, setScenarios] = useState<MockScenario[]>(INITIAL_SCENARIOS);
  const [activeScenarioId, setActiveScenarioId] = useState<string>(INITIAL_SCENARIOS[0].id);
  const [mockModeEnabled, setMockModeEnabled] = useState<boolean>(false);

  const runtimeAllowed = isMockRuntimeAllowed();

  const activeScenario = useMemo(
    () => scenarios.find((s) => s.id === activeScenarioId) ?? scenarios[0],
    [scenarios, activeScenarioId],
  );

  const conflicts = useMemo(
    () => (activeScenario ? detectRuleConflicts(activeScenario.rules) : []),
    [activeScenario],
  );

  const toggleMockMode = useCallback(() => {
    if (!runtimeAllowed) return;
    setMockModeEnabled((prev) => !prev);
  }, [runtimeAllowed]);

  const updateRule = useCallback(
    (ruleId: string, updater: (rule: MockRule) => MockRule) => {
      setScenarios((prev) =>
        prev.map((scn) =>
          scn.id !== activeScenarioId
            ? scn
            : {
                ...scn,
                updatedAt: new Date().toISOString(),
                rules: scn.rules.map((r) => (r.id === ruleId ? updater(r) : r)),
              },
        ),
      );
    },
    [activeScenarioId],
  );

  const addRule = useCallback(
    (rule: MockRule) => {
      setScenarios((prev) =>
        prev.map((scn) =>
          scn.id !== activeScenarioId
            ? scn
            : { ...scn, updatedAt: new Date().toISOString(), rules: [...scn.rules, rule] },
        ),
      );
    },
    [activeScenarioId],
  );

  const switchProfile = useCallback(
    (profile: MockScenario['profile']) => {
      const match = scenarios.find((s) => s.profile === profile);
      if (match) setActiveScenarioId(match.id);
    },
    [scenarios],
  );

  return {
    scenarios,
    activeScenario,
    activeScenarioId,
    setActiveScenarioId,
    mockModeEnabled,
    toggleMockMode,
    runtimeAllowed,
    conflicts,
    updateRule,
    addRule,
    switchProfile,
  };
}
