'use client';

import { useCallback, useMemo, useState } from 'react';

export type GateStatus = 'pass' | 'fail' | 'waived' | 'pending';

export interface ReleaseGate {
  id: string;
  name: string;
  required: boolean;
  status: GateStatus;
  threshold: string;
  actual: string;
  owner: string;
  evidenceUrl: string;
  waiverReason?: string;
  waiverExpiresAt?: string;
}

export interface RiskDimension {
  id: string;
  label: 'CI Health' | 'Regressions' | 'Flake/Stability' | 'Security' | 'Data Quality';
  score: number; // 0-100 (100 = lowest risk)
  trend: 'up' | 'down' | 'flat';
  summary: string;
  drillDownUrl: string;
}

export interface RolloutPhase {
  id: string;
  environment: 'staging' | 'canary-10%' | 'canary-50%' | 'production';
  status: 'completed' | 'active' | 'pending' | 'rolled_back';
  errorRatePct: number;
  p95LatencyMs: number;
  guardrailHealthy: boolean;
}

export interface ApprovalRecord {
  id: string;
  role: 'Release Manager' | 'Security Lead' | 'QA Lead' | 'On-Call SRE';
  approver: string;
  decision: 'approved' | 'rejected' | 'pending';
  timestamp: string;
  note?: string;
}

export interface ReleaseEntity {
  id: string;
  version: string;
  environment: string;
  commitsCount: number;
  prsCount: number;
  owner: string;
  lifecycle: 'evaluating' | 'ready' | 'blocked' | 'rolling_out' | 'released';
  lastUpdatedAt: string;
  gates: ReleaseGate[];
  risks: RiskDimension[];
  rollout: RolloutPhase[];
  approvals: ApprovalRecord[];
}

const INITIAL_RELEASE: ReleaseEntity = {
  id: 'rel-2026-11-21',
  version: 'v2.14.0-rc3',
  environment: 'production',
  commitsCount: 42,
  prsCount: 14,
  owner: '@release-eng',
  lifecycle: 'evaluating',
  lastUpdatedAt: '2026-11-21T10:15:00Z',
  gates: [
    {
      id: 'gate-ci',
      name: 'CI Unit & Integration Suite',
      required: true,
      status: 'pass',
      threshold: '100% pass',
      actual: '100% (412/412)',
      owner: '@ci-bot',
      evidenceUrl: '/runs?filter=ci',
    },
    {
      id: 'gate-sec',
      name: 'WASM & Dependency Security Scan',
      required: true,
      status: 'pass',
      threshold: '0 critical/high',
      actual: '0 critical, 0 high',
      owner: '@sec-team',
      evidenceUrl: '/settings/security',
    },
    {
      id: 'gate-perf',
      name: 'Canary P95 Regression Budget',
      required: true,
      status: 'fail',
      threshold: '<= 180ms',
      actual: '205ms (+13.8%)',
      owner: '@perf-team',
      evidenceUrl: '/trends',
    },
    {
      id: 'gate-a11y',
      name: 'Accessibility Smoke Audit',
      required: false,
      status: 'waived',
      threshold: '0 violations',
      actual: '1 minor contrast warning',
      owner: '@frontend-team',
      evidenceUrl: '/runs',
      waiverReason: 'Non-blocking badge contrast tracked in #2319',
      waiverExpiresAt: '2026-11-28T00:00:00Z',
    },
  ],
  risks: [
    { id: 'r-ci', label: 'CI Health', score: 96, trend: 'up', summary: 'All main workflows green', drillDownUrl: '/runs' },
    { id: 'r-reg', label: 'Regressions', score: 74, trend: 'down', summary: '1 P95 latency regression', drillDownUrl: '/trends' },
    { id: 'r-flake', label: 'Flake/Stability', score: 91, trend: 'flat', summary: '0.4% E2E flake rate', drillDownUrl: '/runs' },
    { id: 'r-sec', label: 'Security', score: 100, trend: 'flat', summary: 'No CVEs detected', drillDownUrl: '/settings/security' },
    { id: 'r-dq', label: 'Data Quality', score: 88, trend: 'up', summary: 'Telemetry schema 100% valid', drillDownUrl: '/analytics' },
  ],
  rollout: [
    { id: 'ph-1', environment: 'staging', status: 'completed', errorRatePct: 0.02, p95LatencyMs: 142, guardrailHealthy: true },
    { id: 'ph-2', environment: 'canary-10%', status: 'active', errorRatePct: 0.15, p95LatencyMs: 205, guardrailHealthy: false },
    { id: 'ph-3', environment: 'canary-50%', status: 'pending', errorRatePct: 0, p95LatencyMs: 0, guardrailHealthy: true },
    { id: 'ph-4', environment: 'production', status: 'pending', errorRatePct: 0, p95LatencyMs: 0, guardrailHealthy: true },
  ],
  approvals: [
    { id: 'ap-1', role: 'QA Lead', approver: '@alice', decision: 'approved', timestamp: '2026-11-21T09:50:00Z', note: 'E2E suite verified' },
    { id: 'ap-2', role: 'Security Lead', approver: '@bob', decision: 'approved', timestamp: '2026-11-21T10:02:00Z' },
    { id: 'ap-3', role: 'Release Manager', approver: '@carol', decision: 'pending', timestamp: '' },
  ],
};

export function useReleaseReadiness(releaseId?: string) {
  const [release, setRelease] = useState<ReleaseEntity>({
    ...INITIAL_RELEASE,
    id: releaseId ?? INITIAL_RELEASE.id,
  });

  const blockingGates = useMemo(
    () => release.gates.filter((g) => g.required && g.status === 'fail'),
    [release.gates],
  );

  const goNoGoStatus = blockingGates.length === 0 ? 'GO' : 'NO-GO';

  const waiveGate = useCallback((gateId: string, reason: string) => {
    setRelease((prev) => ({
      ...prev,
      gates: prev.gates.map((g) =>
        g.id === gateId
          ? {
              ...g,
              status: 'waived',
              waiverReason: reason,
              waiverExpiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
            }
          : g,
      ),
    }));
  }, []);

  const submitApproval = useCallback(
    (approvalId: string, decision: 'approved' | 'rejected', note?: string) => {
      setRelease((prev) => ({
        ...prev,
        approvals: prev.approvals.map((a) =>
          a.id === approvalId
            ? { ...a, decision, note, timestamp: new Date().toISOString() }
            : a,
        ),
      }));
    },
    [],
  );

  const triggerRollback = useCallback((phaseId: string) => {
    setRelease((prev) => ({
      ...prev,
      lifecycle: 'blocked',
      rollout: prev.rollout.map((p) =>
        p.id === phaseId ? { ...p, status: 'rolled_back' } : p,
      ),
    }));
  }, []);

  return {
    release,
    blockingGates,
    goNoGoStatus,
    waiveGate,
    submitApproval,
    triggerRollback,
  };
}
