// WIP scaffold for issue #2271 (Observability & Operations Dashboard).
import { OpsDashboard } from "@/features/ops/observability/OpsDashboard";

export const dynamic = "force-dynamic";

export default function OpsPage() {
  return (
    <div className="container-full page-padding fade-in">
      <h1 className="heading-page">Operations dashboard (WIP)</h1>
      <p className="text-meta mt-1 max-w-3xl">
        Early scaffold for issue #2271 — see <code>docs/ops/observability-dashboard.md</code>.
        Not yet backed by real health/queue/SLO data; see the existing{" "}
        <code>/api/health</code> endpoint for current basic health checks.
      </p>
      <OpsDashboard />
    </div>
  );
}
