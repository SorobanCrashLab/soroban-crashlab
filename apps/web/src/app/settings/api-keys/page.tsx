// WIP scaffold for issue #2275. Token create/list/rotate/revoke already lives at
// /settings/api (ApiTokenManager.tsx); this page is for the new usage-analytics /
// incident-control surface this issue asks for, once it's connected to real data.
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function ApiKeysConsolePage() {
  return (
    <div className="container-full page-padding fade-in">
      <h1 className="heading-page">API keys usage & incident controls (WIP)</h1>
      <p className="text-meta mt-1 max-w-3xl">
        Early scaffold for issue #2275. Token creation/rotation/revocation already exists at{" "}
        <Link href="/settings/api" className="link">
          /settings/api
        </Link>
        . This page is for the net-new usage dashboard and incident controls — not wired to
        real data yet.
      </p>
    </div>
  );
}
