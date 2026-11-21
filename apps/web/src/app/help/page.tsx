// WIP scaffold for issue #2281 (In-App Help Center).
import { HelpCenter } from "@/features/help/HelpCenter";

export const dynamic = "force-dynamic";

export default function HelpPage() {
  return (
    <div className="container-full page-padding fade-in">
      <h1 className="heading-page">Help center (WIP)</h1>
      <p className="text-meta mt-1 max-w-3xl">
        Early scaffold for issue #2281 — see <code>docs/help/</code>. Search is not yet backed
        by an indexed article set.
      </p>
      <HelpCenter articles={[]} />
    </div>
  );
}
