'use client';

/**
 * Post-experiment analysis (#2340): verdict, metric summary, findings and
 * follow-ups into incidents, runbooks, runs, logs and release readiness,
 * plus Markdown/JSON report export.
 */

import Link from 'next/link';
import { downloadTextFile } from '@/app/utils/browser-download';
import type { ExperimentAnalysis as Analysis } from './lib/analysis';

export function ExperimentAnalysis({ analysis }: { analysis: Analysis }) {
  const tone = analysis.verdict === 'supported' ? 'ds-badge-success' : analysis.verdict === 'refuted' ? 'ds-badge-error' : 'ds-badge-warning';
  return (
    <section className="card card-padding flex flex-col gap-3" aria-label="Experiment analysis">
      <div className="flex-between flex-wrap gap-2">
        <h2 className="text-sm-semibold">Analysis</h2>
        <span className={`ds-badge ${tone}`}>Hypothesis {analysis.verdict}</span>
      </div>
      <p className="text-sm">{analysis.verdictDetail}</p>
      <div className="table-responsive overflow-auto">
        <table className="data-table text-sm">
          <caption className="sr-only">Metric summary</caption>
          <thead>
            <tr>
              <th scope="col" className="text-left">Metric</th>
              <th scope="col" className="text-right">Baseline</th>
              <th scope="col" className="text-right">Peak</th>
              <th scope="col" className="text-right">Final</th>
            </tr>
          </thead>
          <tbody>
            {analysis.metrics.map((metric) => (
              <tr key={metric.metric}>
                <th scope="row" className="text-left">{metric.label}</th>
                <td className="text-right">{metric.baseline}</td>
                <td className="text-right">{metric.peak}</td>
                <td className="text-right">{metric.final}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <h3 className="text-sm-medium">Findings</h3>
        <ul className="text-sm list-disc pl-5">
          {analysis.findings.map((finding) => (
            <li key={finding}>{finding}</li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="text-sm-medium">Follow-ups</h3>
        <ul className="text-sm flex flex-wrap gap-2">
          {analysis.followUps.map((followUp) => (
            <li key={followUp.href}>
              <Link className="btn-outline text-xs" href={followUp.href}>
                {followUp.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap gap-2">
        <a className="btn-outline text-xs" href={`/api/chaos/experiments/${encodeURIComponent(analysis.id)}/control?format=markdown`}>
          Download report (Markdown)
        </a>
        <button
          type="button"
          className="btn-outline text-xs"
          onClick={() => downloadTextFile(JSON.stringify(analysis, null, 2), `chaos-${analysis.id}-v${analysis.version}.json`)}
        >
          Export JSON
        </button>
        <span className="text-meta text-xs self-center">
          Definition {analysis.fingerprint} · ≈{analysis.totals.affectedRuns} runs affected
        </span>
      </div>
    </section>
  );
}
