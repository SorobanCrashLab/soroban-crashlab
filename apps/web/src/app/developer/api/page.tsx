// WIP scaffold for issue #2285 (Developer API Console).
import { ApiConsole } from "@/features/developer/api-console/ApiConsole";

export const dynamic = "force-dynamic";

export default function DeveloperApiConsolePage() {
  return (
    <div className="container-full page-padding fade-in">
      <h1 className="heading-page">API console (WIP)</h1>
      <p className="text-meta mt-1 max-w-3xl">
        Early scaffold for issue #2285 — see <code>docs/developer/api-console.md</code>. Request
        execution, auth integration, and snippet generation are not implemented yet.
      </p>
      <ApiConsole />
    </div>
  );
}
