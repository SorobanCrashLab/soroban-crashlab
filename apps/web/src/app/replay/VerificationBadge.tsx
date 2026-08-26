'use client';

import React, { useState } from 'react';
import type { ReplayFingerprint, VerificationState } from './fingerprint';
import { FINGERPRINT_PARTICIPANTS } from './fingerprint';

interface VerificationBadgeProps {
  fingerprint: ReplayFingerprint | undefined;
  currentComponents?: {
    seedSet: string;
    contractWasmHash: string;
    engineVersion: string;
    networkConfigHash: string;
  };
  runId: string;
}

const STATE_CONFIG: Record<VerificationState, { label: string; color: string; bg: string; border: string }> = {
  match: {
    label: 'MATCH',
    color: 'text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    border: 'border-emerald-200 dark:border-emerald-800',
  },
  mismatch: {
    label: 'MISMATCH',
    color: 'text-red-700 dark:text-red-300',
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-800',
  },
  unknown: {
    label: 'UNKNOWN',
    color: 'text-zinc-500 dark:text-zinc-400',
    bg: 'bg-zinc-50 dark:bg-zinc-800/50',
    border: 'border-zinc-200 dark:border-zinc-700',
  },
};

function getState(
  fingerprint: ReplayFingerprint | undefined,
  currentComponents?: {
    seedSet: string;
    contractWasmHash: string;
    engineVersion: string;
    networkConfigHash: string;
  },
): VerificationState {
  if (!fingerprint) return 'unknown';
  if (!currentComponents) return 'unknown';
  if (
    fingerprint.components.seedSet === currentComponents.seedSet &&
    fingerprint.components.contractWasmHash === currentComponents.contractWasmHash &&
    fingerprint.components.engineVersion === currentComponents.engineVersion &&
    fingerprint.components.networkConfigHash === currentComponents.networkConfigHash
  ) {
    return 'match';
  }
  return 'mismatch';
}

export default function VerificationBadge({ fingerprint, currentComponents, runId }: VerificationBadgeProps) {
  const [expanded, setExpanded] = useState(false);
  const state = getState(fingerprint, currentComponents);
  const config = STATE_CONFIG[state];

  const annotationLink = state === 'mismatch'
    ? `/runs/${runId}/annotation-threads/?prefill=Replay%20fingerprint%20mismatch%20detected`
    : null;

  return (
    <div className="inline-block">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition ${config.color} ${config.bg} ${config.border} hover:opacity-80`}
        title="Click to expand verification details"
      >
        <span className={`w-2 h-2 rounded-full ${
          state === 'match' ? 'bg-emerald-500' : state === 'mismatch' ? 'bg-red-500' : 'bg-zinc-400'
        }`} />
        {config.label}
        <svg
          className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg p-4 min-w-[320px]">
          <div className="text-sm font-medium mb-3">Verification Details</div>

          {fingerprint ? (
            <>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                Composite hash: <span className="font-mono text-zinc-700 dark:text-zinc-300">{fingerprint.composite.slice(0, 16)}...</span>
              </div>

              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-400 dark:text-zinc-500">
                    <th className="text-left py-1">Component</th>
                    <th className="text-left py-1">Value</th>
                    {currentComponents && <th className="text-left py-1">Status</th>}
                  </tr>
                </thead>
                <tbody>
                  {FINGERPRINT_PARTICIPANTS.map(({ key, label }) => {
                    const currentVal = currentComponents?.[key];
                    const matches = currentVal === fingerprint.components[key];
                    return (
                      <tr key={key} className="border-t border-zinc-100 dark:border-zinc-800">
                        <td className="py-1.5 text-zinc-600 dark:text-zinc-400">{label}</td>
                        <td className="py-1.5 font-mono text-zinc-700 dark:text-zinc-300">
                          {fingerprint.components[key].slice(0, 12)}...
                        </td>
                        {currentComponents && (
                          <td className="py-1.5">
                            <span className={matches ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                              {matches ? '✓' : '✗'}
                            </span>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {state === 'mismatch' && annotationLink && (
                <a
                  href={annotationLink}
                  className="mt-3 block text-center text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Log mismatch annotation →
                </a>
              )}
            </>
          ) : (
            <div className="text-xs text-zinc-400 dark:text-zinc-500">
              No fingerprint recorded for this run (legacy or pre-verification).
            </div>
          )}
        </div>
      )}
    </div>
  );
}
