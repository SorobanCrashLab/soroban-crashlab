'use client';

import React from 'react';
import { ApprovalRecord } from './hooks/useReleaseReadiness';

interface ApprovalWorkflowProps {
  approvals: ApprovalRecord[];
  onDecide: (approvalId: string, decision: 'approved' | 'rejected') => void;
}

export function ApprovalWorkflow({ approvals, onDecide }: ApprovalWorkflowProps) {
  return (
    <section aria-label="Approval Workflow" className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-4">
      <h2 className="mb-3 text-sm font-semibold text-zinc-100">Role Sign-Offs & Audit Trail</h2>
      <div className="space-y-2">
        {approvals.map((ap) => (
          <div
            key={ap.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs"
          >
            <div>
              <span className="font-semibold text-zinc-200">{ap.role}</span>{' '}
              <span className="text-zinc-400">({ap.approver})</span>
              {ap.note && <span className="ml-2 text-zinc-400">— {ap.note}</span>}
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded px-2 py-0.5 font-semibold uppercase ${
                  ap.decision === 'approved'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : ap.decision === 'rejected'
                      ? 'bg-rose-500/20 text-rose-300'
                      : 'bg-zinc-800 text-zinc-300'
                }`}
              >
                {ap.decision}
              </span>
              {ap.decision === 'pending' && (
                <>
                  <button
                    type="button"
                    onClick={() => onDecide(ap.id, 'approved')}
                    className="rounded bg-emerald-600 px-2 py-1 text-white hover:bg-emerald-500"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => onDecide(ap.id, 'rejected')}
                    className="rounded bg-rose-600 px-2 py-1 text-white hover:bg-rose-500"
                  >
                    Reject
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
