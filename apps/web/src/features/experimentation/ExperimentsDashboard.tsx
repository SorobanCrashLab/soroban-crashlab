/*
 * ExperimentsDashboard — #2299 (issue/078-frontend-experimentation-impact-analytics)
 * Phase 1 scaffold: flag/experiment registry views (variants, targeting,
 * rollout stages, owners, change history).
 */

import type { Experiment } from '@/lib/analytics/experimentation';

export default function ExperimentsDashboard({ experiments }: { experiments: Experiment[] }) {
  return (
    <main>
      <h1>Experiments</h1>
      {experiments.map((e) => (
        <article key={e.id}>
          <h2>{e.name}</h2>
          <p>
            {e.status} · owner {e.owner} · {e.variants.length} variant(s)
          </p>
        </article>
      ))}
    </main>
  );
}
