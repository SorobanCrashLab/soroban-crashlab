// WIP scaffold for issue #2271. Not yet backed by /api/ops/health-summary.
export const dynamic = "force-dynamic";

export default function OpsHealthPage() {
  return (
    <div className="container-full page-padding fade-in">
      <h1 className="heading-page">System health (WIP)</h1>
      <p className="text-meta mt-1">
        See the existing <code>/api/health</code> endpoint for current basic liveness/metrics
        checks until this page is wired to real SLI/SLO data.
      </p>
    </div>
  );
}
