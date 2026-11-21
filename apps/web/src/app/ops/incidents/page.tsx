// WIP scaffold for issue #2271 (ops incident diagnostics view). Distinct from the
// standalone Incident Command Center (#2286) at /incidents — this is correlation of
// infra/queue/integration signals specifically, not full incident lifecycle management.
import { IncidentTimelinePanel } from "@/features/ops/observability/panels/IncidentTimelinePanel";

export const dynamic = "force-dynamic";

export default function OpsIncidentsPage() {
  return (
    <div className="container-full page-padding fade-in">
      <h1 className="heading-page">Incident diagnostics (WIP)</h1>
      <IncidentTimelinePanel events={[]} />
    </div>
  );
}
