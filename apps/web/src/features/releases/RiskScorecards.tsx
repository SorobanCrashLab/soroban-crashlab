'use client';

import React from 'react';
import { RiskDimension } from './hooks/useReleaseReadiness';

interface RiskScorecardsProps {
  risks: RiskDimension[];
}

export function RiskScorecards({ risks }: RiskScorecardsProps) {
  return (
    <section aria-label="Risk Scorecards" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {risks.map((risk) => (
        <div key={risk.id} className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3.5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>{risk.label}</span>
            <span className="uppercase">{risk.trend}</span>
          </div>
          <div
            className={`mt-1 text-2xl font-bold ${
              risk.score >= 90 ? 'text-emerald-400' : risk.score >= 75 ? 'text-amber-400' : 'text-rose-400'
            }`}
          >
            {risk.score}/100
          </div>
          <p className="mt-1 text-xs text-zinc-400">{risk.summary}</p>
        </div>
      ))}
    </section>
  );
}
