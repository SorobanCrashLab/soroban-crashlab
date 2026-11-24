// WIP scaffold for issue #2286 (Incident postmortem workflow).
import { PostmortemEditor } from "@/features/incidents/PostmortemEditor";

export const dynamic = "force-dynamic";

export default async function IncidentPostmortemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="container-full page-padding fade-in">
      <h1 className="heading-page">Postmortem for incident {id} (WIP)</h1>
      <PostmortemEditor onSave={() => undefined} />
    </div>
  );
}
