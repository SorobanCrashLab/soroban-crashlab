// WIP scaffold for issue #2285 (Developer API Console collections).
import { Collections } from "@/features/developer/api-console/Collections";

export const dynamic = "force-dynamic";

export default function DeveloperApiCollectionsPage() {
  return (
    <div className="container-full page-padding fade-in">
      <h1 className="heading-page">Saved request collections (WIP)</h1>
      <Collections collections={[]} />
    </div>
  );
}
