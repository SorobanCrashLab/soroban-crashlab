// WIP scaffold for issue #2286 (Incident Command Center).
import { IncidentCommandCenter } from "@/features/incidents/IncidentCommandCenter";

export const dynamic = "force-dynamic";

export default function IncidentsPage() {
  return (
    <div className="container-full page-padding fade-in">
      <h1 className="heading-page">Incident command center (WIP)</h1>
      <p className="text-meta mt-1 max-w-3xl">
        Early scaffold for issue #2286 — see <code>docs/ops/incident-command-center.md</code>.
        Incident lifecycle, correlated timelines, and postmortems are not implemented yet.
      </p>
      <IncidentCommandCenter />
    </div>
  );
}
