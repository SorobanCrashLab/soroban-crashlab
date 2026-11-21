'use client';

import React from 'react';
import { useReleaseReadiness } from './hooks/useReleaseReadiness';
import { GateMatrix } from './GateMatrix';
import { RiskScorecards } from './RiskScorecards';
import { RolloutTracker } from './RolloutTracker';
import { ApprovalWorkflow } from './ApprovalWorkflow';

interface ReleaseCommandCenterProps {
  releaseId?: string;
}

export function ReleaseCommandCenter({ releaseId }: ReleaseCommandCenterProps) {
  const { release, blockingGates, goNoGoStatus, waiveGate, submitApproval, triggerRollback } =
    useReleaseReadiness(releaseId);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 text-zinc-100">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">Release Readiness & Ops Command Center</h1>
            <span
              className={`rounded px-2.5 py-0.5 text-xs font-bold ${
                goNoGoStatus === 'GO'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-rose-500/20 text-rose-300'
              }`}
            >
              {goNoGoStatus}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            {release.version} • {release.commitsCount} commits, {release.prsCount} PRs • Owner:{' '}
            {release.owner} • Blocking gates: {blockingGates.length}
          </p>
        </div>
        <div className="text-xs text-zinc-500">
          Last evaluated: <time>{release.lastUpdatedAt}</time>
        </div>
      </header>

      <RiskScorecards risks={release.risks} />
      <GateMatrix gates={release.gates} onWaiveGate={waiveGate} />
      <RolloutTracker phases={release.rollout} onRollback={triggerRollback} />
      <ApprovalWorkflow approvals={release.approvals} onDecide={submitApproval} />
    </div>
  );
}
