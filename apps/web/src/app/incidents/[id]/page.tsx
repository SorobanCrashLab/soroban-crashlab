// WIP scaffold for issue #2286 (Incident Command Center detail view).
import { IncidentDetail } from "@/features/incidents/IncidentDetail";

export const dynamic = "force-dynamic";

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="container-full page-padding fade-in">
      <IncidentDetail
        incident={{ id, title: `Incident ${id}`, status: "detected", severity: "medium" }}
        events={[]}
      />
    </div>
  );
}
