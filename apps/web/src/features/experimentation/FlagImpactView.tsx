/*
 * FlagImpactView — #2299
 * Rollout dashboards per flag/experiment with exposure timelines and
 * cohort breakdowns.
 */

export default function FlagImpactView({ flag }: { flag: string }) {
  return (
    <section aria-label={`Flag impact: ${flag}`}>
      {flag} — exposure timeline + cohort breakdown
    </section>
  );
}
